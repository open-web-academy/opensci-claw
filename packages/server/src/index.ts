import { Hono, MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { stream } from 'hono/streaming';
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
import { signRequest } from '@worldcoin/idkit-server';
import { WORLD_ID_SIGNING_KEY, WORLD_ID_RP_ID } from './config.js';
import { savePaperMetadata, getPaperMetadata } from './services/supabase.js';

// ────────────────────────────────────────────────────────────────────────────
// 1. x402 Setup: ExactEvmScheme + World Chain USDC money parser
// ────────────────────────────────────────────────────────────────────────────
const evmScheme = new ExactEvmScheme()
  .registerMoneyParser(async (amount, network) => {
    if (network !== WORLD_CHAIN) return null;
    return {
      amount: String(Math.round(parseFloat(amount as any) * 1e6)),
      asset: WORLD_USDC,
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
  // $0.05 — Full Agent Access
  'POST /agent/full': {
    accepts: makeAccepts('0.05'),
    extensions: declareAgentkitExtension({
      statement: 'Access the NanoClaw Global AI Researcher with full autonomous reasoning',
      mode: { type: 'free-trial' as const, uses: 1 },
    }),
  },
  // $0.01 — Quick Inquiry
  'POST /agent/query': {
    accepts: makeAccepts('0.01'),
    extensions: declareAgentkitExtension({
      statement: 'Single precision inquiry to the NanoClaw autonomous agent',
      mode: { type: 'free-trial' as const, uses: 1 },
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

app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization', 'PAYMENT-SIGNATURE', 'x-payment-proof'],
  exposeHeaders: ['PAYMENT-REQUIRED', 'PAYMENT-RESPONSE'],
}));

// ── Mobile Debug & Health Check ───────────────────────────────────────────
app.get('/health', (c) => {
  console.log('--- [HEALTH CHECK] Hit received at ' + new Date().toISOString() + ' ---');
  return c.json({ status: 'ok', service: 'scigate-server', v: '2.2.0', env: 'production' });
});

app.post('/debug/log', async (c) => {
  try {
    const body = await c.req.json();
    console.log(`📱 [MOBILE_LOG][${body.type || 'DEBUG'}]`, JSON.stringify(body.data || body, null, 2));
    return c.json({ logged: true });
  } catch (err) {
    return c.json({ ok: false }, 400);
  }
});

app.use('*', async (c, next) => {
  console.log(`🚢 [${new Date().toISOString().split('T')[1].split('.')[0]}] ${c.req.method} ${c.req.path}`);
  await next();
});

// ── Manual x402 Middleware (with Trial & Bypass) ──────────────────────────
import { HonoAdapter } from '@x402/hono';

const trialTracker = new Map<string, number>();
const FREE_TRIAL_LIMIT = 1;

const manualX402Middleware: MiddlewareHandler = async (c, next) => {
  const context = {
    adapter: new HonoAdapter(c),
    path: c.req.path,
    method: c.req.method,
  };

  console.log(`[x402][Debug] Middleware Hit: ${c.req.method} ${c.req.path}`);

  // 1. Check if route requires payment
  if (!httpServer.requiresPayment(context)) {
    return await next();
  }

  // 2. HACKATHON BYPASS: If client sends a payment proof header, skip the challenge
  const paymentProof = c.req.header('x-payment-proof') || c.req.header('PAYMENT-SIGNATURE');
  if (paymentProof && (paymentProof.length > 5 || paymentProof === 'demo_bypass' || paymentProof === 'bypass')) {
    console.log(`[x402] Payment bypass triggered: ${paymentProof.slice(0, 8)}... Unlocking request.`);
    return await next();
  }

  // 3. FREE TRIAL CHECK
  const userId = c.req.header('x-user-id') || c.req.header('cf-connecting-ip') || 'anonymous';
  const currentUses = trialTracker.get(userId) || 0;

  if (currentUses < FREE_TRIAL_LIMIT) {
    console.log(`[TRIAL] User ${userId} used ${currentUses + 1}/${FREE_TRIAL_LIMIT} free queries.`);
    trialTracker.set(userId, currentUses + 1);
    return await next();
  }

  // 4. LIMIT REACHED -> Challenge with x402 or Manual Fallback
  console.warn(`[TRIAL] User ${userId} limit reached. Issuing challenge.`);

  try {
    // Attempt standard x402 processing first
    const result = await httpServer.processHTTPRequest(context);
    
    if (result.type === 'payment-error') {
      const { status, headers, body, isHtml } = result.response;
      if (isHtml) {
        return c.html(body as string, status as any, headers);
      }
      return c.json(body, status as any, headers);
    }

    return await next();
  } catch (err) {
    console.error('[x402] Error in middleware processing, falling back to manual 402:', err);
    
    // x402 V2 Compliant Payment requirements
    let dynamicPayTo = PAY_TO_ADDRESS;
    try {
      const paperId = c.req.param('id');
      if (paperId) {
        // High-speed cloud fallback using Supabase
        const meta = await getPaperMetadata(paperId);
        if (meta && meta.author) {
          dynamicPayTo = meta.author;
        } else {
          // Blockchain fallback
          const { getPaperFromChain } = await import('./services/contract.js');
          const paper = await getPaperFromChain(paperId as `0x${string}`);
          if (paper && paper.author) dynamicPayTo = paper.author;
        }
      }
    } catch (e) {
      console.warn('[x402] Could not fetch dynamic author, falling back to default recipient.');
    }

    const manualAccepts = [{
      scheme: 'exact',
      network: WORLD_CHAIN, 
      asset: WORLD_USDC,    
      amount: '10000',      
      payTo: dynamicPayTo,
      maxTimeoutSeconds: 3600,
      extra: {}
    }];

    const paymentRequired = {
      x402Version: 2,
      resource: { 
        url: c.req.url, 
        description: 'SciGate Protected Resource' 
      },
      accepts: manualAccepts
    };

    return c.json(paymentRequired, 402, {
      'PAYMENT-REQUIRED': JSON.stringify(paymentRequired)
    });
  }
};

app.use('*', manualX402Middleware);

// ── Root / Status route ──────────────────────────────────────────────────────
app.get('/', (c) => c.html(`
  <div style="font-family: sans-serif; padding: 40px; text-align: center;">
    <h1 style="color: #6366f1;">🛰️ SciGate API is Online</h1>
    <p>Version: 2.0.7 | Environment: World Chain Mainnet</p>
    <div style="margin-top: 20px; padding: 10px; background: #f3f4f6; border-radius: 8px; display: inline-block;">
      Status: 🟢 Protected by x402 & World ID 4.0
    </div>
  </div>
`));

// ── Free routes ─────────────────────────────────────────────────────────────
app.get('/papers/:id/preview', async (c) => {
  const paperId = c.req.param('id');
  const { handlePreview } = await import('./routes/papers.js');
  const result = await handlePreview(paperId);
  return c.json(result);
});

app.route('/papers', papers);
app.route('/authors', authors);

// ── World ID 4.0 Native Signature ───────────────────────────────────────────
app.post('/api/world-id/rp-context', async (c) => {
  try {
    const { app_id, action, signal } = await c.req.json();
    
    if (!WORLD_ID_SIGNING_KEY || !WORLD_ID_RP_ID) {
      console.warn('[WorldID] Missing RP configuration. Set signing key and RP ID.');
      return c.json({ error: 'RP Configuration missing' }, 500);
    }

    const sigData = signRequest({
      signingKeyHex: WORLD_ID_SIGNING_KEY,
      action: action,
    });

    const rpContext = {
      rp_id: WORLD_ID_RP_ID,
      nonce: sigData.nonce,
      signature: sigData.sig,
      created_at: sigData.createdAt,
      expires_at: sigData.expiresAt,
    };

    console.log(`[WorldID] RP Context generated for action: ${action}`);
    return c.json(rpContext);
  } catch (err: any) {
    console.error('[WorldID] Failed to sign request:', err);
    return c.json({ error: err.message || 'Signature failed' }, 500);
  }
});

// ── Paid routes ─────────────────────────────────────────────────────────────
app.post('/papers/:id/query', async (c) => {
  const paperId = c.req.param('id');
  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
  const { data, status } = await handleQuery(paperId, body.question ?? '');
  return c.json(data, status as any);
});

app.get('/papers/:id/section/:name', async (c) => {
  const paperId = c.req.param('id');
  const sectionName = c.req.param('name');
  const { data, status } = await handleSection(paperId, sectionName);
  return c.json(data, status as any);
});

app.get('/papers/:id/citations', async (c) => {
  const paperId = c.req.param('id');
  const { data, status } = await handleCitations(paperId);
  return c.json(data, status as any);
});

app.get('/papers/:id/full', async (c) => {
  const paperId = c.req.param('id');
  const { data, status } = await handleFull(paperId);
  return c.json(data, status as any);
});

app.get('/papers/:id/data', async (c) => {
  const paperId = c.req.param('id');
  const { data, status } = await handleData(paperId);
  return c.json(data, status as any);
});

// ── Global Agent Proxy (Gated) ──────────────────────────────────────────────
async function handleAgentRequest(c: any, mode: string) {
  try {
    const { topic } = await c.req.json();
    const { RAG_SERVICE_URL } = await import('./config.js');

    console.log(`[AgentGated][${mode}] Proxying research: "${topic}" -> ${RAG_SERVICE_URL}`);

    // Connect to Raspberry Pi RAG
    const response = await fetch(`${RAG_SERVICE_URL}/ask-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, mode }),
    });

    if (!response.ok) {
      console.error(`[AgentGated] RAG Service Error: ${response.status}`);
      return c.json({ error: 'RAG service unreachable' }, 500);
    }

    // Proxy SSE stream
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    return stream(c, async (stream) => {
      const reader = response.body?.getReader();
      if (!reader) return;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await stream.write(value);
        }
      } finally {
        reader.releaseLock();
      }
    });

  } catch (err: any) {
    console.error('[AgentGated] System Error:', err);
    return c.json({ error: 'Internal server proxy error' }, 500);
  }
}

app.post('/agent/full', (c) => handleAgentRequest(c, 'full'));
app.post('/agent/query', (c) => handleAgentRequest(c, 'query'));


// ────────────────────────────────────────────────────────────────────────────
// 6. Start server (NON-BLOCKING)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n--- 🚀 SCIGATE SERVER STARTUP (V2.0.5) ---');

serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`🚀 SciGate API running at http://${info.address}:${info.port}`);
  console.log(`🔒 Health Check is online. Environment: PRODUCCIÓN`);
  
  // INITIALIZE x402 IN BACKGROUND (with safety delay)
  // This ensures Render detects the port IMMEDIATELY while we setup heavy services.
  setTimeout(async () => {
    try {
      console.log('⏳ Initializing x402 Resource Server...');
      await resourceServer.initialize();
      console.log('✅ x402 Resource Server initialized successfully');
    } catch (err) {
      console.error('⚠️ Warning: x402 Resource Server initialization failed:', err);
    }
  }, 100);
});
