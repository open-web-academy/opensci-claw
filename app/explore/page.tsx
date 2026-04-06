'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MiniKit, Tokens } from '@worldcoin/minikit-js';

const API_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3001';
const RECIPIENT = process.env.NEXT_PUBLIC_PAY_TO_ADDRESS ?? '0x0000000000000000000000000000000000000000';

interface PaperResult {
  paper_id?: string;
  id?: string;
  contentHash?: string;
  metadataURI?: string;
  author?: string;
  pricePerQuery?: string;
  active?: boolean;
}

export default function ExplorePage() {
  const getPaperId = (paper: any) => paper?.paper_id || paper?.id || 'unknown';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState<any>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState('');
  const [needsPayment, setNeedsPayment] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [showBypassButton, setShowBypassButton] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setShowBypassButton(false);
    try {
      const res = await fetch(`/api/papers/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(data.results ?? []);
    } catch (err: any) {
      setError(`Search failed: ${err.message}`);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleQuery(e: React.FormEvent) {
    e.preventDefault();
    const paperId = getPaperId(selectedPaper);
    if (!selectedPaper || paperId === 'unknown' || !question.trim()) return;
    setAnswering(true);
    setAnswer('');
    setError('');
    setShowBypassButton(false);

    try {
      const res = await fetch(`/api/papers/${encodeURIComponent(paperId)}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      if (res.status === 402) {
        setAnswer('');
        setNeedsPayment(true);
        setError('💳 Payment required. This query requires $0.01 USDC via x402.');
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAnswer(data.answer);
    } catch (err: any) {
      setError(`Query failed: ${err.message}`);
    } finally {
      setAnswering(false);
    }
  }

  async function handlePayment() {
    if (!selectedPaper) return;
    setPaymentLoading(true);
    setError('⏳ Solicitando autorización a World App...');
    
    // Safety timer for the demo: If the simulator doesn't respond in 4s, warn the user
    const timer = setTimeout(() => {
      setError('⚠️ El simulador no responde. Puedes saltar el pago para la demo.');
      setShowBypassButton(true);
      setPaymentLoading(false);
    }, 4000);

    try {
      if (!MiniKit.isInstalled()) {
        setError('❌ Error: MiniKit no detectado. Abre esto dentro del Simulador.');
        setPaymentLoading(false);
        setShowBypassButton(true);
        clearTimeout(timer);
        return;
      }

      // x402 Payment request using MiniKit commands - ASYNC STABLE VERSION
      const paperId = getPaperId(selectedPaper);
      const paperIdShort = String(paperId).slice(-8);
      const refId = `pay_${paperIdShort}_${Math.floor(Date.now() / 1000)}`;
      
      console.log("[MiniKit] Invoking Payment:", { to: RECIPIENT, ref: refId, token: 'USDCE' });
      setError(`💳 Solicitando pago de $0.01 USDC...`);

      const response = await MiniKit.commandsAsync.pay({
        reference: refId,
        chainId: 4801, // World Chain Sepolia
        tokens: [{
          symbol: 'USDCE', 
          amount: "0.01",
        }],
        to: RECIPIENT,
        recipient: RECIPIENT,
      } as any);
      
      clearTimeout(timer);
      console.log("[MiniKit] Result Received:", response);
      const payload = (response as any).finalPayload;
      
      // --- HACKATHON DEMO BYPASS ---
      // We accept 'success' OR 'error' from typical simulator failures to ensure the RAG works
      if (response && (payload?.status === 'success' || payload?.status === 'error')) {
        if (payload?.status === 'error') {
          setError('⚠️ Simulator: Bypass de pago activo para la Demo.');
        } else {
          setError('✓ Pago exitoso. Obteniendo respuesta...');
        }
        
        setNeedsPayment(false);
        setTimeout(() => {
          handleQuery({ preventDefault: () => {} } as any);
        }, 1000);
      } else {
        const detail = payload?.status || "sin respuesta";
        setError(`❌ Pago no completado (${detail}). Reintenta o revisa el simulador.`);
      }
    } catch (err: any) {
      console.error('Payment execution error:', err);
      clearTimeout(timer);
      setError(`❌ Error de MiniKit: ${err.message || 'Desconocido'}`);
    } finally {
      setPaymentLoading(false);
    }
  }

  return (
    <>
      <nav>
        <div className="nav-inner">
          <Link href="/" className="nav-logo">⬡ SciGate</Link>
          <ul className="nav-links">
            <li><Link href="/explore" style={{ color: 'var(--text-primary)' }}>Explore</Link></li>
            <li><Link href="/upload">Publish</Link></li>
            <li><Link href="/dashboard">Dashboard</Link></li>
          </ul>
        </div>
      </nav>

      <main style={{ paddingTop: 100, minHeight: '100vh' }}>
        <div className="container">
          <div style={{ marginBottom: 48 }}>
            <h1 style={{ fontSize: 'clamp(32px, 4vw, 52px)', marginBottom: 12 }}>
              Explore <span className="gradient-text">Papers</span>
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 17 }}>
              Search academic papers. First 3 queries are free — then $0.01 USDC per query via x402.
            </p>
          </div>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="search-form">
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search papers: e.g. 'transformer attention mechanism', 'climate change models'..."
              style={{ flex: 1, fontSize: 15, padding: '14px 20px' }}
            />
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? '⏳' : '🔍'} Search
            </button>
          </form>

          {error && (
            <div style={{
              padding: '16px 20px',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 'var(--radius-md)',
              color: '#f87171',
              marginBottom: 24,
              fontSize: 14,
            }}>
              {error}
            </div>
          )}

          <div className={`grid-responsive ${selectedPaper ? 'split' : ''}`}>
            {/* Results list */}
            <div>
              {results.length === 0 && !loading && !error && (
                <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🔬</div>
                  <p>Search for papers above to explore the catalog</p>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {results.map((paper, i) => (
                  <div
                    key={i}
                    className="card"
                    style={{ cursor: 'pointer', borderColor: getPaperId(selectedPaper) === getPaperId(paper) ? 'var(--accent-indigo)' : undefined }}
                    onClick={() => { setSelectedPaper(paper); setAnswer(''); setQuestion(''); }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <span className="badge badge-verified">✓ World ID Verified</span>
                      <span style={{ color: 'var(--accent-emerald)', fontSize: 13, fontWeight: 600 }}>$0.01/query</span>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
                      {paper.snippet ?? paper.text?.slice(0, 200) ?? 'No preview available'}...
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'monospace' }}>
                        Paper {getPaperId(paper).slice(0, 16)}...
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Page {paper.page}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Query panel */}
            {selectedPaper && (
              <div className="card" style={{ position: 'sticky', top: 100, height: 'fit-content' }}>
                <h3 style={{ marginBottom: 8 }}>Ask this paper</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 20 }}>
                  3 free queries • Then $0.01 USDC/query via x402
                </p>

                <form onSubmit={handleQuery} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <textarea
                    className="input"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="What methodology does this paper use?"
                    rows={3}
                    style={{ resize: 'vertical' }}
                  />
                  <button type="submit" className="btn-primary" disabled={answering || !question.trim()}>
                    {answering ? '🤔 Thinking...' : '🧠 Ask RAG'}
                  </button>
                </form>

                {needsPayment && (
                  <div style={{ marginTop: 12 }}>
                    <button 
                      className="btn-primary" 
                      onClick={handlePayment}
                      disabled={paymentLoading}
                      style={{ 
                        background: 'var(--accent-emerald)', 
                        borderColor: 'var(--accent-emerald)',
                        color: 'white',
                        width: '100%'
                      }}
                    >
                      {paymentLoading ? '⏳ Confirming...' : '💳 Pay $0.01 to Unlock'}
                    </button>
                    
                    {showBypassButton && (
                      <button 
                        onClick={() => {
                          setNeedsPayment(false);
                          setShowBypassButton(false);
                          handleQuery({ preventDefault: () => {} } as any);
                        }}
                        className="btn-secondary"
                        style={{ marginTop: 12, width: '100%', borderColor: '#f59e0b', color: '#f59e0b', fontSize: 13 }}
                      >
                        ⚠️ Saltar Pago (Modo Demo Hackathon)
                      </button>
                    )}
                  </div>
                )}

                {answer && (
                  <div style={{
                    marginTop: 20,
                    padding: '16px',
                    background: 'rgba(16,185,129,0.06)',
                    border: '1px solid rgba(16,185,129,0.15)',
                    borderRadius: 'var(--radius-md)',
                  }}>
                    <div style={{ fontSize: 12, color: 'var(--accent-emerald)', fontWeight: 600, marginBottom: 8 }}>✓ RAG Answer</div>
                    <p style={{ color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{answer}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
