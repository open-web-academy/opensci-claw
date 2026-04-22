import 'dotenv/config';

// ============================================================
// SciGate Server — Configuration Constants
// ============================================================

export const PORT = parseInt(process.env.PORT ?? '3001', 10);

// ── Blockchain Networks ──────────────────────────────────────
export const WORLD_CHAIN = 'eip155:480' as const;
export const BASE        = 'eip155:8453' as const;
export const SOLANA      = 'solana:5eykt6Us1jXYEx24e525bddW8SfcUM' as const; // Mainnet Beta

// ── USDC on World Chain (Mainnet) ──────────────────────────
export const WORLD_USDC  = '0x79A02482A880bCe3F13E09da970dC34dB4cD24D1'; // Native World Chain USDC
export const BASE_USDC   = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const SOLANA_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // Native Solana USDC

// ── x402 Facilitators ────────────────────────────────────────
// Using the universal facilitator that handles both Mainnet and Sepolia
export const WORLD_FACILITATOR_URL = 'https://x402-worldchain.vercel.app/facilitator';
export const BASE_FACILITATOR_URL  = 'https://api.cdp.coinbase.com/platform/v2/x402';
export const SOLANA_FACILITATOR_URL = 'https://x402-solana.vercel.app/facilitator'; // Conceptual/Community Facilitator

// ── Wallet that receives x402 payments ───────────────────────
export const PAY_TO_ADDRESS = process.env.NEXT_PUBLIC_PAY_TO_ADDRESS ?? '0x2eb655c6828d633e70c82b3b7eccac731d9b8ba7';
export const PAY_TO_ADDRESS_SOLANA = process.env.PAY_TO_ADDRESS_SOLANA ?? '4TCn2QhKtpX92LxEX7wZMKemQaMXpvcJ86VaoUxR4Deg';
export const RECIPIENT = PAY_TO_ADDRESS;

// ── Smart Contract ───────────────────────────────────────────
export const WORLD_CHAIN_RPC         = process.env.WORLD_CHAIN_RPC ?? 'https://rpc.worldchain.dev';
export const PAPER_REGISTRY_ADDRESS  = (process.env.PAPER_REGISTRY_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`;

// ── World ID ─────────────────────────────────────────────────
export const WORLD_APP_ID    = process.env.WORLD_APP_ID    ?? 'app_aacdf4487837b144901774135e3b0803';
export const WORLD_ACTION_ID = process.env.WORLD_ACTION_ID ?? 'verify-author';
export const WORLD_ID_RP_ID  = process.env.WORLD_ID_RP_ID  ?? '';
export const WORLD_ID_SIGNING_KEY = process.env.WORLD_ID_SIGNING_KEY ?? '';

// ── RAG Engine ───────────────────────────────────────────────
export const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL ?? 'https://nonenthusiastic-trochoidal-dovie.ngrok-free.dev';

// ── Prices (in USD) ──────────────────────────────────────────
export const PRICES = {
  query:     '$0.01',
  section:   '$0.02',
  citations: '$0.005',
  full:      '$0.10',
  data:      '$0.15',
} as const;

// ── Free-Trial Limits ─────────────────────────────────────────
export const FREE_TRIAL_QUERY = 3;  // uses for $0.01 endpoints
export const FREE_TRIAL_FULL  = 1;  // uses for $0.10+ endpoints
