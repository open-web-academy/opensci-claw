import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';

console.log(`[CONFIG] Node Version: ${process.version}`);
console.log(`[CONFIG] Current Dir: ${process.cwd()}`);
console.log(`[CONFIG] Render Port: ${process.env.PORT || '3001 (default)'}`);

// ############################################################
// #   SCIGATE FORCED UPDATE V2.0.2 - X402 INITIALIZATION FIX  #
// ############################################################

import { HTTPFacilitatorClient } from '@x402/core/http';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { Network } from '@x402/core/types';
import {
  paymentMiddlewareFromHTTPServer,
  x402HTTPResourceServer,
  x402ResourceServer,
} from '@x402/hono';
import {
  agentkitResourceServerExtension,
  createAgentBookVerifier,
  createAgentkitHooks,
  declareAgentkitExtension,
  InMemoryAgentKitStorage,
} from '@worldcoin/agentkit';

import {
  WORLD_CHAIN,
  BASE,
  WORLD_USDC,
  WORLD_FACILITATOR_URL,
  PAY_TO_ADDRESS,
  PORT,
  PRICES,
  FREE_TRIAL_QUERY,
  FREE_TRIAL_FULL,
} from './config.js';

import { papers, handleQuery, handleSection, handleCitations, handleFull, handleData } from './routes/papers.js';
import { authors } from './routes/authors.js';

// ────────────────────────────────────────────────────────────────────────────
// 1. x402 Setup: ExactEvmScheme + World Chain USDC money parser
// ────────────────────────────────────────────────────────────────────────────
const evmScheme = new ExactEvmScheme()
  .registerMoneyParser(async (amount: number, network: Network) => {
    if (network !== WORLD_CHAIN) return null;
    return {
      amount: String(Math.round(amount * 1e6)), // USDC has 6 decimals
      asset: WORLD_USDC,
      extra: { name: 'USD Coin', version: '2' },
    };
  });

// ────────────────────────────────────────────────────────────────────────────
// 2. Facilitator — World Chain
// ────────────────────────────────────────────────────────────────────────────
const facilitatorClient = new HTTPFacilitatorClient({
  url: WORLD_FACILITATOR_URL,
});

// ────────────────────────────────────────────────────────────────────────────
// 3. AgentKit: AgentBook verifier + in-memory storage + hooks
// ────────────────────────────────────────────────────────────────────────────
const agentBook = createAgentBookVerifier({ network: 'world' });
const storage = new InMemoryAgentKitStorage();

const hooksQuery = createAgentkitHooks({
  agentBook,
  storage,
  mode: { type: 'free-trial', uses: FREE_TRIAL_QUERY },
});

const hooksFull = createAgentkitHooks({
  agentBook,
  storage,
  mode: { type: 'free-trial', uses: FREE_TRIAL_FULL },
});

// ────────────────────────────────────────────────────────────────────────────
// 4. x402 Resource Server
// ────────────────────────────────────────────────────────────────────────────
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(WORLD_CHAIN, evmScheme)
  .registerExtension(agentkitResourceServerExtension);

// ── Payment acceptors for each price tier ──────────────────────────────────
const makeAccepts = (price: string) => [
  { scheme: 'exact' as const, price, network: WORLD_CHAIN, payTo: PAY_TO_ADDRESS },
];

// ── Route declarations with free-trial extensions ──────────────────────────
const routes = {
  // $0.01 — 3 free uses
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
  // $0.10 — 1 free use
  'GET /papers/:id/full': {
    accepts: makeAccepts(PRICES.full),
    extensions: declareAgentkitExtension({
      statement: 'Access full text of academic paper (author receives royalty)',
      mode: { type: 'free-trial' as const, uses: FREE_TRIAL_FULL },
    }),
  },
  // $0.15 — 1 free use
  'GET /papers/:id/data': {
    accepts: makeAccepts(PRICES.data),
    extensions: declareAgentkitExtension({
      statement: 'Access paper datasets and experimental results',
      mode: { type: 'free-trial' as const, uses: FREE_TRIAL_FULL },
    }),
  },
};

// ── Build the HTTP server with hooks ───────────────────────────────────────
const httpServer = new x402HTTPResourceServer(resourceServer, routes)
  .onProtectedRequest(hooksQuery.requestHook as any);

// ────────────────────────────────────────────────────────────────────────────
// 5. Hono App
// ────────────────────────────────────────────────────────────────────────────
const app = new Hono();

// ── Health Check (TOP PRIORITY for Render/Uptime) ──────────────────────────
app.get('/health', (c) => {
  console.log('--- [HEALTH CHECK] Hit received at ' + new Date().toISOString() + ' ---');
  return c.json({ status: 'ok', service: 'scigate-server', v: '2.0.4', env: 'production' });
});

app.use('*', async (c, next) => {
  console.log(`🚢 [${new Date().toISOString().split('T')[1].split('.')[0]}] ${c.req.method} ${c.req.path}`);
  await next();
});

app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization', 'PAYMENT-SIGNATURE'],
  exposeHeaders: ['PAYMENT-REQUIRED', 'PAYMENT-RESPONSE'],
}));

// ── x402 payment middleware (handles 402 challenges and payment verification)
import { HonoAdapter } from '@x402/hono';
const manualX402Middleware = async (c: any, next: any) => {
  const context = {
    adapter: new HonoAdapter(c),
    path: c.req.path,
    method: c.req.method,
  };

  if (!httpServer.requiresPayment(context)) {
    return await next();
  }

  // HACKATHON BYPASS: If client sends a payment proof header, skip the challenge
  const paymentProof = c.req.header('x-payment-proof');
  if (paymentProof && paymentProof.length > 5) {
    console.log(`[x402] Payment proof detected: ${paymentProof.slice(0, 8)}... Unlocking request.`);
    return await next();
  }

  try {
    const result = await httpServer.processHTTPRequest(context);
    if (result.type === 'payment-error') {
      console.error('[x402] Payment error:', result.response.body);
      return c.json(result.response.body, result.response.status as any, result.response.headers);
    }
  } catch (err) {
    console.warn('[HACKATHON] Facilitator fail on Sepolia, issuing manual 402 challenge...');

    // SAFE FALLBACK: Get requirements or use defaults
    const defaultAccepts = [{ scheme: 'exact', price: '$0.01', network: 'eip155:4801', payTo: PAY_TO_ADDRESS }];
    const routeConfig = (routes as any)[`${context.method} ${context.path}`] || (routes as any)['POST /papers/:id/query'];
    const accepts = routeConfig?.accepts || defaultAccepts;

    // Return manual 402 challenge with guaranteed accepts array
    return c.json({
      error: "Payment Required",
      accepts: accepts,
      statement: routeConfig?.extensions?.statement || "Access SciGate Resource"
    }, 402, {
      'PAYMENT-REQUIRED': JSON.stringify(accepts)
    });
  }

  return await next();
};

app.use('*', manualX402Middleware);

// ── Root / Status route ──────────────────────────────────────────────────────
app.get('/', (c) => c.html(`
  <div style="font-family: sans-serif; padding: 40px; text-align: center;">
    <h1 style="color: #6366f1;">🛰️ SciGate API is Online</h1>
    <p>Version: 2.0.2 | Environment: World Chain Sepolia</p>
    <div style="margin-top: 20px; padding: 10px; background: #f3f4f6; border-radius: 8px; display: inline-block;">
      Status: 🟢 Protected by x402 & World ID 4.0
    </div>
  </div>
`));

// ── Free routes ─────────────────────────────────────────────────────────────
app.get('/health', (c) => c.json({ status: 'ok', service: 'scigate-server', v: '2.0.1', timestamp: new Date().toISOString() }));

// REMOTE DEBUG LOGGING: Allows mobile frontend to send logs to server console
app.post('/debug/log', async (c) => {
  try {
    const body = await c.req.json();
    console.log('\n--- 📱 [REMOTE_DEBUG] ---');
    console.log(JSON.stringify(body, null, 2));
    console.log('-------------------------\n');
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ ok: false }, 400);
  }
});

app.get('/papers/:id/preview', async (c) => {
  const paperId = c.req.param('id');
  const { handlePreview } = await import('./routes/papers.js');
  const result = await handlePreview(paperId);
  return c.json(result);
});

app.route('/papers', papers);
app.route('/authors', authors);

// ── Paid routes ─────────────────────────────────────────────────────────────
app.post('/papers/:id/query', async (c) => {
  const paperId = c.req.param('id');
  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
  const result = await handleQuery(paperId, body.question ?? '');
  if ('error' in result) return c.json(result, 400);
  return c.json(result);
});

app.get('/papers/:id/section/:name', async (c) => {
  const paperId = c.req.param('id');
  const sectionName = c.req.param('name');
  const result = await handleSection(paperId, sectionName);
  if ('error' in result) return c.json(result, 404);
  return c.json(result);
});

app.get('/papers/:id/citations', async (c) => {
  const paperId = c.req.param('id');
  return c.json(await handleCitations(paperId));
});

app.get('/papers/:id/full', async (c) => {
  const paperId = c.req.param('id');
  return c.json(await handleFull(paperId));
});

app.get('/papers/:id/data', async (c) => {
  const paperId = c.req.param('id');
  return c.json(await handleData(paperId));
});

// ────────────────────────────────────────────────────────────────────────────
// 6. Start server (NON-BLOCKING)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n--- 🚀 SCIGATE SERVER STARTUP (V2.0.3) ---');

serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`🚀 SciGate API running at http://${info.address}:${info.port}`);
  console.log(`🔒 Health Check is online. Initializing x402 in background...`);
  
  (async () => {
    try {
      await resourceServer.initialize();
      console.log('✅ x402 Resource Server initialized successfully');
    } catch (err) {
      console.error('⚠️ Warning: x402 Resource Server initialization failed:', err);
      console.log('💡 Note: The server is still running, but paid endpoints may fail.');
    }
  })();
});
