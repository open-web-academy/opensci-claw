import { createPublicClient, http, parseAbiItem, decodeEventLog } from 'viem';
import { WORLD_CHAIN_RPC, WORLD_USDC } from '../config.js';

const client = createPublicClient({
  transport: http(WORLD_CHAIN_RPC),
});

// ERC-20 Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);

/**
 * In-memory replay cache. Good enough for a single instance;
 * replace with Supabase table `used_tx_hashes` when running multi-instance.
 */
const usedHashes = new Set<string>();

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  amount?: bigint;
  to?: string;
}

/**
 * Verifies that `txHash` corresponds to an ERC-20 Transfer of at least `minAmount` USDC
 * to `expectedRecipient` on World Chain. Rejects on replay.
 */
export async function verifyUsdcPayment(
  txHash: `0x${string}`,
  expectedRecipient: `0x${string}`,
  minAmount: bigint
): Promise<VerifyResult> {
  if (!txHash || !txHash.startsWith('0x') || txHash.length !== 66) {
    return { ok: false, reason: 'malformed-tx-hash' };
  }

  if (usedHashes.has(txHash.toLowerCase())) {
    return { ok: false, reason: 'replay-detected' };
  }

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch (err: any) {
    return { ok: false, reason: `rpc-error: ${err.message}` };
  }

  if (!receipt || receipt.status !== 'success') {
    return { ok: false, reason: 'tx-failed-or-missing' };
  }

  for (const log of receipt.logs) {
    // MAINNET CHECK: Verificamos estrictamente la dirección del USDC oficial
    if (log.address.toLowerCase() !== WORLD_USDC.toLowerCase()) continue;
    
    if (log.topics[0] !== TRANSFER_TOPIC) continue;

    try {
      const decoded = decodeEventLog({
        abi: [TRANSFER_EVENT],
        data: log.data,
        topics: log.topics,
      });
      const args = decoded.args as unknown as { from: string; to: string; value: bigint };
      if (
        args.to.toLowerCase() === expectedRecipient.toLowerCase() &&
        args.value >= minAmount
      ) {
        usedHashes.add(txHash.toLowerCase());
        return { ok: true, amount: args.value, to: args.to };
      }
    } catch {
      /* keep scanning logs */
    }
  }

  return { ok: false, reason: 'no-matching-transfer' };
}
