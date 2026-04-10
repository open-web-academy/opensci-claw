import 'dotenv/config';

// ============================================================
// SciGate Server — Configuration Constants
// ============================================================

export const PORT = parseInt(process.env.PORT ?? '3001', 10);

// ── Blockchain Networks ──────────────────────────────────────
export const WORLD_CHAIN = 'eip155:4801' as const;
export const BASE        = 'eip155:8453' as const;

// ── USDC on World Chain (Testnet/Sepolia mapping) ──────────
export const WORLD_USDC  = '0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88'; // Official World Chain Sepolia USDC
export const BASE_USDC   = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// ── x402 Facilitators ────────────────────────────────────────
// Using the universal facilitator that handles both Mainnet and Sepolia
export const WORLD_FACILITATOR_URL = 'https://x402-worldchain.vercel.app/facilitator';
export const BASE_FACILITATOR_URL  = 'https://api.cdp.coinbase.com/platform/v2/x402';

// ── Wallet that receives x402 payments ───────────────────────
export const PAY_TO_ADDRESS = process.env.PAY_TO_ADDRESS ?? '0x2eb655c6828d633e70c82b3b7eccac731d9b8ba7';

// ── Smart Contract ───────────────────────────────────────────
export const WORLD_CHAIN_RPC         = process.env.WORLD_CHAIN_RPC ?? 'https://worldchain-sepolia.g.alchemy.com/public';
export const PAPER_REGISTRY_ADDRESS  = (process.env.PAPER_REGISTRY_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`;

// ── World ID ─────────────────────────────────────────────────
export const WORLD_APP_ID    = process.env.WORLD_APP_ID    ?? 'app_staging_aacdf4487837b144901774135e3b0803';
export const WORLD_ACTION_ID = process.env.WORLD_ACTION_ID ?? 'verify-author';

// ── RAG Engine ───────────────────────────────────────────────
export const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL ?? 'http://100.95.133.124:10000';

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
