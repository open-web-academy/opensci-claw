
import { createWalletClient, createPublicClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: '../../.env' });

const worldChainSepolia = defineChain({
  id: 4801,
  name: 'World Chain Sepolia',
  network: 'world-chain-sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.WORLD_CHAIN_RPC || 'https://worldchain-sepolia.g.alchemy.com/public'] },
    public: { http: [process.env.WORLD_CHAIN_RPC || 'https://worldchain-sepolia.g.alchemy.com/public'] },
  },
});

async function main() {
  const pk = process.env.PRIVATE_KEY;
  const targetWallet = '0x2eb655c6828d633e70c82b3b7eccac731d9b8ba7';
  
  if (!pk) {
    console.error('No PRIVATE_KEY found in .env');
    return;
  }

  const account = privateKeyToAccount(`0x${pk.replace('0x', '')}`);
  const publicClient = createPublicClient({
    chain: worldChainSepolia,
    transport: http()
  });

  const walletClient = createWalletClient({
    account,
    chain: worldChainSepolia,
    transport: http()
  });

  try {
    const balance = await publicClient.getBalance({ address: account.address });
    console.log(`--- Wallet Status ---`);
    console.log(`Server Wallet: ${account.address}`);
    console.log(`Balance: ${formatEther(balance)} ETH`);

    if (balance > parseEther('0.005')) {
      console.log(`\nSending 0.005 ETH to ${targetWallet}...`);
      const hash = await walletClient.sendTransaction({
        to: targetWallet,
        value: parseEther('0.005')
      });
      console.log(`✅ Success! Transaction Hash: ${hash}`);
    } else {
      console.log(`\n❌ Server wallet has insufficient funds (${formatEther(balance)} ETH).`);
      console.log(`Please use the PoW faucet funds you obtained.`);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
