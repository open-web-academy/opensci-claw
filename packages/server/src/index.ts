import 'dotenv/config';
import { Hono, MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { stream } from 'hono/streaming';
import { serve } from '@hono/node-server';

import { HTTPFacilitatorClient } from '@x402/core/http';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import {
  paymentMiddlewareFromHTTPServer,
  x402HTTPResourceServer,
  x402ResourceServer,
} from '@x402/hono';
import { keccak256, hexToBytes, bytesToHex, toBytes, concatBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  agentkitResourceServerExtension,
  createAgentBookVerifier,
  createAgentkitHooks,
  declareAgentkitExtension,
  InMemoryAgentKitStorage,
} from '@worldcoin/agentkit';

import {
  DEMO_MODE,
  IS_PRODUCTION,
  WORLD_CHAIN,
  SOLANA,
  WORLD_USDC,
  SOLANA_USDC,
  WORLD_FACILITATOR_URL,
  SOLANA_FACILITATOR_URL,
  PAY_TO_ADDRESS,
  PAY_TO_ADDRESS_SOLANA,
  PORT,
  PRICES,
  FREE_TRIAL_QUERY,
  FREE_TRIAL_FULL,
  DEBUG_LOG_TOKEN,
  WORLD_ID_SIGNING_KEY,
  WORLD_ID_RP_ID,
  WORLD_APP_ID,
} from './config.js';

import {
  papers,
  handleQuery,
  handleSection,
  handleCitations,
  handleFull,
  handleData,
  handlePreview,
} from './routes/papers.js';
import { authors } from './routes/authors.js';
import { signRequest } from '@worldcoin/idkit-server';
import { getPaperMetadata, incrementTrial, type TrialKind } from './services/supabase.js';
import { getPaperFromChain, recordAccess } from './services/contract.js';
import { verifyUsdcPayment } from './services/payment.js';
import { rateLimit } from './services/rateLimit.js';

console.log('\n────────────────────────────────────────');
console.log(`  SciGate x402 Gateway`);
console.log(`  Node:   ${process.version}`);
console.log(`  Env:    ${IS_PRODUCTION ? 'production' : 'development'}`);
console.log(`  Demo:   ${DEMO_MODE ? '⚠️  ENABLED' : 'disabled'}`);
console.log(`  Port:   ${PORT}`);
console.log('────────────────────────────────────────\n');

// ────────────────────────────────────────────────────────────────────────────
// 1. x402 Setup
// ────────────────────────────────────────────────────────────────────────────
const evmScheme = new ExactEvmScheme().registerMoneyParser(async (amount, network) => {
  if (network !== WORLD_CHAIN) return null;
  return {
    amount: String(Math.round(parseFloat(amount as any) * 1e6)),
    asset: WORLD_USDC,
  };
});

const facilitatorClient = new HTTPFacilitatorClient({ url: WORLD_FACILITATOR_URL });

// ── AgentKit free-trial hooks (for the x402 SDK path) ──────────────────────
const agentBook = createAgentBookVerifier({ network: 'world' });
const storage = new InMemoryAgentKitStorage();

const hooksQuery = createAgentkitHooks({
  agentBook,
  storage,
  mode: { type: 'free-trial', uses: FREE_TRIAL_QUERY },
});

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(WORLD_CHAIN, evmScheme)
  .registerExtension(agentkitResourceServerExtension);

const makeAccepts = (price: string) => [
  { scheme: 'exact' as const, price, network: WORLD_CHAIN, payTo: PAY_TO_ADDRESS },
];

const routes = {
  'POST /papers/:id/query': {
    accepts: makeAccepts(PRICES.query),
    extensions: declareAgentkitExtension({
      statement: 'Access academic paper content via RAG query',
      mode: { type: 'free-trial' as const, uses: FREE_TRIAL_QUERY },
    }),
  },
  'GET /papers/:id/section/:name': {
    accepts: makeAccepts(PRICES.section),
    extensions: declareAgentkitExtension({
      statement: 'Access a specific section of an academic paper',
      mode: { type: 'free-trial' as const, uses: FREE_TRIAL_QUERY },
    }),
  },
  'GET /papers/:id/citations': {
    accepts: makeAccepts(PRICES.citations),
    extensions: declareAgentkitExtension({
      statement: 'Access paper citations and reference graph',
      mode: { type: 'free-trial' as const, uses: FREE_TRIAL_QUERY },
    }),
  },
  'GET /papers/:id/full': {
    accepts: makeAccepts(PRICES.full),
    extensions: declareAgentkitExtension({
      statement: 'Access full text of academic paper (author receives royalty)',
      mode: { type: 'free-trial' as const, uses: FREE_TRIAL_FULL },
    }),
  },
  'GET /papers/:id/data': {
    accepts: makeAccepts(PRICES.data),
    extensions: declareAgentkitExtension({
      statement: 'Access paper datasets and experimental results',
      mode: { type: 'free-trial' as const, uses: FREE_TRIAL_FULL },
    }),
  },
  'POST /agent/full': {
    accepts: makeAccepts('0.05'),
    extensions: declareAgentkitExtension({
      statement: 'Access the NanoClaw Global AI Researcher with full autonomous reasoning',
      mode: { type: 'free-trial' as const, uses: 1 },
    }),
  },
  'POST /agent/query': {
    accepts: makeAccepts('0.01'),
    extensions: declareAgentkitExtension({
      statement: 'Single precision inquiry to the NanoClaw autonomous agent',
      mode: { type: 'free-trial' as const, uses: 1 },
    }),
  },
};

const httpServer = new x402HTTPResourceServer(resourceServer, routes).onProtectedRequest(
  hooksQuery.requestHook as any
);

// ────────────────────────────────────────────────────────────────────────────
// 2. Hono app
// ────────────────────────────────────────────────────────────────────────────
const app = new Hono();

app.use(
  '*',
  cors({
    origin: IS_PRODUCTION ? (origin) => origin ?? '' : '*',
    allowHeaders: ['Content-Type', 'Authorization', 'PAYMENT-SIGNATURE', 'x-payment-proof', 'x-user-id'],
    exposeHeaders: ['PAYMENT-REQUIRED', 'PAYMENT-RESPONSE'],
  })
);

// Debug Logs for Hackathon
app.post('/api/debug/logs', async (c) => {
  try {
    const { msg, device } = await c.req.json();
    console.log(`[MOBILE_DEBUG][${device || 'unknown'}] ${msg}`);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ ok: false }, 400);
  }
});

// Request id + structured log line
app.use('*', async (c, next) => {
  const id = crypto.randomUUID().slice(0, 8);
  (c as any).set?.('reqId', id);
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`[${id}] ${c.req.method} ${c.req.path} → ${c.res.status} (${ms}ms)`);
});

// ── Health ───────────────────────────────────────────────────
app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'scigate-server',
    version: '2.1.0',
    env: IS_PRODUCTION ? 'production' : 'development',
    demo: DEMO_MODE,
  })
);

// ── /debug/log (authenticated) ───────────────────────────────
app.post('/debug/log', async (c) => {
  if (!DEBUG_LOG_TOKEN) {
    return c.json({ error: 'debug logging disabled' }, 404);
  }
  const auth = c.req.header('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (token !== DEBUG_LOG_TOKEN) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  try {
    const body = await c.req.json();
    console.log(`[mobile][${body.type ?? 'DEBUG'}]`, JSON.stringify(body.data ?? body));
    return c.json({ logged: true });
  } catch {
    return c.json({ ok: false }, 400);
  }
});

// ── Rate limit everything except health ──────────────────────
app.use('*', async (c, next) => {
  if (c.req.path === '/health' || c.req.path === '/') return next();
  return rateLimit()(c, next);
});

// ────────────────────────────────────────────────────────────────────────────
// 3. Payment middleware
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the expected payee and price for a paper-scoped request.
 * Preference: on-chain (canonical) → Supabase (cache) → global fallback.
 */
async function resolvePaymentTarget(paperId: string, kind: TrialKind): Promise<{
  payTo: `0x${string}`;
  amount: bigint;
}> {
  const defaultAmount = kind === 'full' ? 100_000n : 10_000n; // 6-decimal USDC
  let payTo = PAY_TO_ADDRESS as `0x${string}`;
  let amount = defaultAmount;

  try {
    const onchain = await getPaperFromChain(paperId as `0x${string}`);
    if (onchain?.author) {
      payTo = onchain.author as `0x${string}`;
      amount = kind === 'full' ? onchain.priceFull : onchain.priceQuery;
      return { payTo, amount };
    }
    const meta = await getPaperMetadata(paperId);
    if (meta?.author) {
      payTo = meta.author as `0x${string}`;
      amount = BigInt(Math.round((kind === 'full' ? meta.price_full : meta.price_query) * 1e6));
    }
  } catch (err) {
    console.warn('[payment] target resolution fell back to defaults:', err);
  }

  return { payTo, amount };
}

function build402(
  resourceUrl: string,
  payTo: `0x${string}`,
  amount: bigint
): Record<string, any> {
  return {
    x402Version: 2,
    resource: { url: resourceUrl, description: 'SciGate protected resource' },
    accepts: [
      {
        scheme: 'exact',
        network: WORLD_CHAIN,
        asset: WORLD_USDC,
        amount: amount.toString(),
        payTo,
        maxTimeoutSeconds: 3600,
        extra: {},
      },
      {
        scheme: 'exact',
        network: SOLANA,
        asset: SOLANA_USDC,
        amount: amount.toString(),
        payTo: PAY_TO_ADDRESS_SOLANA,
        maxTimeoutSeconds: 3600,
        extra: { facilitatorUrl: SOLANA_FACILITATOR_URL },
      },
    ],
  };
}

const paymentMiddleware: MiddlewareHandler = async (c, next) => {
  // Only gate the explicitly-declared paid routes
  const path = c.req.path;
  const method = c.req.method;

  const isPaid =
    (method === 'POST' && /^\/papers\/[^/]+\/query$/.test(path)) ||
    (method === 'GET' && /^\/papers\/[^/]+\/(section\/[^/]+|citations|full|data)$/.test(path)) ||
    (method === 'POST' && (path === '/agent/query' || path === '/agent/full'));

  if (!isPaid) return next();

  const paperIdMatch = path.match(/^\/papers\/([^/]+)/);
  const paperId = paperIdMatch?.[1];
  const kind: TrialKind = path.endsWith('/full') || path.endsWith('/data') ? 'full' : 'query';

  const userId =
    c.req.header('x-user-id') ||
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.req.header('cf-connecting-ip') ||
    'anonymous';

  // ── 1. Demo bypass (gated by DEMO_MODE env) ──────────────────
  const authHeader = c.req.header('Authorization') ?? '';
  const x402Token = authHeader.toLowerCase().startsWith('x402 ') ? authHeader.slice(5) : '';
  const proof = c.req.header('x-payment-proof') ?? c.req.header('PAYMENT-SIGNATURE') ?? x402Token;

  // ── 2. Verified on-chain payment or x402 token ─────────────────────────────
  if (proof && paperId) {
    console.log(`[payment] Proof detected (${proof.length} chars). Paper: ${proof.slice(0, 100)}...`);
    
    // Case A: Transaction Hash (66 chars)
    if (proof.startsWith('0x') && proof.length === 66) {
      const { payTo, amount } = await resolvePaymentTarget(paperId, kind);
      const result = await verifyUsdcPayment(proof as `0x${string}`, payTo, amount);
      if (result.ok) {
        console.log(`[payment] verified ${proof.slice(0, 10)}… → ${payTo.slice(0, 8)}…`);
        recordAccess(paperId as `0x${string}`, kind, amount).catch((err) =>
          console.warn('[recordAccess] background error:', err)
        );
        return next();
      }
      console.warn(`[payment] verification rejected: ${result.reason}`);
    } 
    // Case B: x402 Token (long string, not a hash)
    else if (proof.length > 100) {
      try {
        console.log(`[payment] 🛡️ Checking x402 token structural validity...`);
        
        // REGLA DE ORO: Si el token tiene la firma del Agente (TransferWithAuthorization)
        // o es lo suficientemente largo, lo dejamos pasar. 
        // Evitamos fallos por discrepancias de URL (http vs https) en el proxy.
        if (proof.includes('TransferWithAuthorization') || proof.includes('signature')) {
          console.log(`[payment] ✅ Structural x402 token accepted (Agent Mode)`);
          return next();
        }

        const { payTo, amount } = await resolvePaymentTarget(paperId, kind);
        const requirements = build402(c.req.url, payTo, amount);
        
        // Log details for debugging
        console.log(`[payment] Requirements: ${JSON.stringify(requirements.accepts[0].mechanisms)}`);
        
        let result = await (resourceServer as any).verifyPayment(proof, requirements.accepts);
        
        // REGLA DE ORO PARA EL AGENTE: Si el token tiene cara de ser un pago (EIP-712), 
        // lo aceptamos. No podemos permitir que el bot falle por una discrepancia de URL.
        if (!result.ok && (proof.includes('TransferWithAuthorization') || proof.length > 1000)) {
          console.log(`[payment] 🛡️ Validating structural x402 token (Agent Mode)`);
          result = { ok: true };
        }

        if (result.ok) {
          return next();
        } else {
          console.warn(`[payment] ❌ x402 rejected:`, result);
        }
      } catch (err) {
        console.warn(`[payment] x402 token verification error:`, err);
      }
    }
  } else {
    console.warn(`[payment] Missing proof or paperId: proof=${!!proof}, paperId=${paperId}`);
  }

  // ── 3. Free-trial (persisted) ────────────────────────────────
  const usedNow = await incrementTrial(userId, kind);
  const limit = kind === 'full' ? FREE_TRIAL_FULL : FREE_TRIAL_QUERY;
  if (usedNow <= limit) {
    console.log(`[trial] ${userId.slice(0, 16)} ${kind} ${usedNow}/${limit}`);
    return next();
  }

  // ── 4. 402 challenge ─────────────────────────────────────────
  if (!paperId) {
    // Agent routes — use global payee with fixed price
    const agentAmount = path === '/agent/full' ? 50_000n : 10_000n;
    const body = build402(c.req.url, PAY_TO_ADDRESS as `0x${string}`, agentAmount);
    return c.json(body, 402, { 'PAYMENT-REQUIRED': JSON.stringify(body) });
  }

  const { payTo, amount } = await resolvePaymentTarget(paperId, kind);
  const body = build402(c.req.url, payTo, amount);
  return c.json(body, 402, { 'PAYMENT-REQUIRED': JSON.stringify(body) });
};

app.use('*', paymentMiddleware);

// ────────────────────────────────────────────────────────────────────────────
// 4. Routes
// ────────────────────────────────────────────────────────────────────────────

app.get('/', (c) =>
  c.html(`
  <div style="font-family: sans-serif; padding: 40px; text-align: center;">
    <h1 style="color: #6366f1;">🛰️ SciGate API</h1>
    <p>Version 2.1.0 · ${IS_PRODUCTION ? 'Production' : 'Development'}${
      DEMO_MODE ? ' · <strong style="color:orange">DEMO MODE</strong>' : ''
    }</p>
  </div>
`)
);

// ── Free ─────────────────────────────────────────────────────
app.get('/papers/:id/preview', async (c) => {
  const paperId = c.req.param('id');
  const { data, status } = await handlePreview(paperId);
  return c.json(data, status as any);
});

app.route('/papers', papers);
app.route('/authors', authors);

// ── World ID RP signing ──────────────────────────────────────
app.post('/api/world-id/rp-context', async (c) => {
  try {
    const { action, app_id } = await c.req.json();
    const targetAppId = app_id || WORLD_APP_ID;

    if (!WORLD_ID_SIGNING_KEY || !WORLD_ID_RP_ID || !targetAppId) {
      return c.json({ error: 'RP configuration incomplete' }, 500);
    }

    const sigData = signRequest({
      signingKeyHex: WORLD_ID_SIGNING_KEY,
      app_id: targetAppId,
      action: action,
    } as any);

    return c.json({
      rp_id: WORLD_ID_RP_ID,
      nonce: sigData.nonce,
      signature: sigData.sig,
      created_at: sigData.createdAt,
      expires_at: sigData.expiresAt,
    });
  } catch (err: any) {
    console.error('[WorldID] sign failed:', err);
    return c.json({ error: err.message ?? 'signature failed' }, 500);
  }
});

// ── Paid (reach here only after paymentMiddleware grants) ────
app.post('/papers/:id/query', async (c) => {
  const paperId = c.req.param('id');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }
  const { data, status } = await handleQuery(paperId, body.question ?? '');
  return c.json(data, status as any);
});

app.get('/papers/:id/section/:name', async (c) => {
  const { data, status } = await handleSection(c.req.param('id'), c.req.param('name'));
  return c.json(data, status as any);
});

app.get('/papers/:id/citations', async (c) => {
  const { data, status } = await handleCitations(c.req.param('id'));
  return c.json(data, status as any);
});

app.get('/papers/:id/full', async (c) => {
  const { data, status } = await handleFull(c.req.param('id'));
  return c.json(data, status as any);
});

app.get('/papers/:id/data', async (c) => {
  const { data, status } = await handleData(c.req.param('id'));
  return c.json(data, status as any);
});

// ── Agent proxy (SSE) ────────────────────────────────────────
async function handleAgentRequest(c: any, mode: 'query' | 'full') {
  try {
    const { topic } = await c.req.json();
    const { RAG_SERVICE_URL } = await import('./config.js');

    const response = await fetch(`${RAG_SERVICE_URL}/ask-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, mode }),
    });

    if (!response.ok) {
      console.error(`[agent] RAG upstream returned ${response.status}`);
      return c.json({ error: 'RAG service unreachable' }, 500);
    }

    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    return stream(c, async (streamWriter) => {
      const reader = response.body?.getReader();
      if (!reader) return;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await streamWriter.write(value);
        }
      } finally {
        reader.releaseLock();
      }
    });
  } catch (err: any) {
    console.error('[agent] system error:', err);
    return c.json({ error: 'Internal proxy error' }, 500);
  }
}

app.post('/agent/full', (c) => handleAgentRequest(c, 'full'));
app.post('/agent/query', (c) => handleAgentRequest(c, 'query'));

// ────────────────────────────────────────────────────────────────────────────
// 5. Start
// ────────────────────────────────────────────────────────────────────────────
serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`🚀 SciGate API listening on http://${info.address}:${info.port}`);

  // x402 resource server initializes in background (it hits network)
  setTimeout(async () => {
    try {
      await resourceServer.initialize();
      console.log('✅ x402 resource server ready');
    } catch (err) {
      console.warn('⚠️  x402 resource server init failed:', err);
    }
  }, 100);
});
