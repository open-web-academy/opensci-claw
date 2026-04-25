import 'dotenv/config';

// ============================================================
// SciGate Server — Configuration Constants
// ============================================================

export const NODE_ENV = process.env.NODE_ENV ?? 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';

/**
 * Demo mode unifies every "hackathon bypass" behind one flag.
 * Enables:
 *   - x-payment-proof: demo_bypass (or PAYMENT-SIGNATURE: demo_bypass) passes without on-chain check
 *   - World ID verification succeeds if the upstream API rejects the proof
 *   - Manual wallet fallback UI is shown
 * NEVER set to true in production.
 */
export const DEMO_MODE = true; // Forzado a true para permitir saltarse el pago al cancelar

if (DEMO_MODE && IS_PRODUCTION) {
  console.warn('\n────────────────────────────────────────────────────────────────────────');
  console.warn('  ⚠️  WARNING: DEMO_MODE=true is active in a PRODUCTION environment.');
  console.warn('  This configuration allows bypassing payments and identity checks.');
  console.warn('  ONLY USE THIS FOR HACKATHON DEMONSTRATIONS.');
  console.warn('────────────────────────────────────────────────────────────────────────\n');
}

export const PORT = parseInt(process.env.PORT ?? '3001', 10);

// ── Blockchain networks (x402 network identifiers) ──────────
// NOTE: the Solana identifier must match between server and RAG. Keep them in sync.
export const WORLD_CHAIN = 'eip155:480' as const; // Cambiado a Mainnet (Producción)
export const BASE = 'eip155:8453' as const;
/**
 * Solana Mainnet identifier used by x402.
 * Genesis-hash prefix variant shared with packages/rag/services/x402_handler.py.
 * If you change this, change it in both places.
 */
export const SOLANA = 'solana:5eykt4UsFv8P8NJdTREpY1vzqAQZSSfL' as const;

// ── USDC addresses (native) ─────────────────────────────────
export const WORLD_USDC = '0x79A02482A880bCe3F13E09da970dC34dB4cD24D1';
export const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const SOLANA_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// ── x402 facilitators ───────────────────────────────────────
export const WORLD_FACILITATOR_URL = 'https://x402-worldchain.vercel.app/facilitator';
export const BASE_FACILITATOR_URL = 'https://api.cdp.coinbase.com/platform/v2/x402';
export const SOLANA_FACILITATOR_URL = 'https://x402-solana.vercel.app/facilitator';

// ── Receiving wallets ───────────────────────────────────────
export const PAY_TO_ADDRESS =
  process.env.PAY_TO_ADDRESS ??
  process.env.NEXT_PUBLIC_PAY_TO_ADDRESS ??
  '';
export const PAY_TO_ADDRESS_SOLANA = process.env.PAY_TO_ADDRESS_SOLANA ?? '';
export const RECIPIENT = PAY_TO_ADDRESS;

// ── On-chain registry ───────────────────────────────────────
export const WORLD_CHAIN_RPC = process.env.WORLD_CHAIN_RPC ?? 'https://rpc.worldchain.dev';
export const PAPER_REGISTRY_ADDRESS = (process.env.PAPER_REGISTRY_ADDRESS ?? '') as `0x${string}` | '';
/**
 * Hot wallet used to call recordAccess() on-chain after paid accesses.
 * If unset, paid accesses are tracked off-chain only.
 */
export const RECORDER_PRIVATE_KEY = process.env.RECORDER_PRIVATE_KEY ?? '';

// ── World ID ────────────────────────────────────────────────
export const WORLD_APP_ID = process.env.WORLD_APP_ID ?? '';
export const WORLD_ACTION_ID = process.env.WORLD_ACTION_ID ?? 'verify-author';
export const WORLD_ID_RP_ID = process.env.WORLD_ID_RP_ID ?? '';
export const WORLD_ID_SIGNING_KEY = process.env.WORLD_ID_SIGNING_KEY ?? '';

// ── RAG engine ──────────────────────────────────────────────
export const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL ?? 'http://127.0.0.1:8000';

// ── Pricing (human-readable, parsed to USDC 6-decimals at runtime) ──
export const PRICES = {
  query: '$0.01',
  section: '$0.02',
  citations: '$0.005',
  full: '$0.10',
  data: '$0.15',
} as const;

// ── Free-trial limits (single source of truth) ──────────────
export const FREE_TRIAL_QUERY = 3;
export const FREE_TRIAL_FULL = 1;

// ── Observability ───────────────────────────────────────────
export const DEBUG_LOG_TOKEN = process.env.DEBUG_LOG_TOKEN ?? '';

// ── Rate limiting ───────────────────────────────────────────
export const RATE_LIMIT_RPM = parseInt(process.env.RATE_LIMIT_RPM ?? '20', 10);

// ── Fail-fast validation for production ─────────────────────
if (IS_PRODUCTION && !DEMO_MODE) {
  const missing: string[] = [];
  if (!PAY_TO_ADDRESS) missing.push('PAY_TO_ADDRESS');
  if (!WORLD_APP_ID) missing.push('WORLD_APP_ID');
  if (!PAPER_REGISTRY_ADDRESS) missing.push('PAPER_REGISTRY_ADDRESS');
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length) {
    console.error('⚠️  Missing required production env vars:', missing.join(', '));
    process.exit(1);
  }
}
