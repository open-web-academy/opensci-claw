'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MiniKit, Tokens } from '@worldcoin/minikit-js';

const API_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3001';
const RECIPIENT = process.env.NEXT_PUBLIC_PAY_TO_ADDRESS ?? '0x2eb655c6828d633e70c82b3b7eccac731d9b8ba7';

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
  const [paidPapers, setPaidPapers] = useState<Record<string, string>>({});
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  // REMOTE LOGGING HELPER: Sends info to server console for mobile debugging
  async function remoteLog(type: string, data: any) {
    try {
      await fetch(`${API_URL}/debug/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data, timestamp: new Date().toISOString() })
      });
    } catch (err) {
      console.warn('Remote logging failed (probably local dev)', err);
    }
  }

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

  async function handleQuery(e?: React.FormEvent, forcedProof?: string) {
    if (e) e.preventDefault();
    const paperId = getPaperId(selectedPaper);
    if (!selectedPaper || paperId === 'unknown' || !question.trim()) return;
    
    setAnswering(true);
    setAnswer('');
    setError('');
    setShowBypassButton(false);

    try {
      const res = await fetch(`/api/papers/${encodeURIComponent(paperId)}/query`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-payment-proof': forcedProof || paidPapers[paperId] || ''
        },
        body: JSON.stringify({ question }),
      });

      if (res.status === 402) {
        setAnswer('');
        setNeedsPayment(true);
        setIsPaymentModalOpen(true); // OPEN PRE-CHECKOUT MODAL
        setError('💳 Micropayment required to unlock deep analytical RAG insights.');
        return;
      }
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.error || 'Failed to query paper');
      }

      const data = await res.json();
      setAnswer(data.answer || 'No answer found.');
      setNeedsPayment(false); 
      setIsPaymentModalOpen(false); // CLOSE MODAL IF OPEN
    } catch (err: any) {
      setError(`Query failed: ${err.message}`);
      await remoteLog('QUERY_EXCEPTION', { paperId, question, error: err.message });
    } finally {
      setAnswering(false);
    }
  }

  async function handlePayment() {
    if (!selectedPaper) return;
    const paperId = getPaperId(selectedPaper);
    
    setPaymentLoading(true);
    setError(''); 
    
    const timer = setTimeout(() => {
      setError('⚠️ El simulador no responde.');
      setPaymentLoading(false);
    }, 5000);

    try {
      if (!MiniKit.isInstalled()) {
        setError('❌ Error: MiniKit no detectado.');
        setPaymentLoading(false);
        setIsPaymentModalOpen(false);
        setShowBypassButton(true);
        clearTimeout(timer);
        return;
      }

      const paperIdShort = String(paperId).slice(-6);
      const refId = `pay_${paperIdShort}_${Math.floor(Date.now() / 1000)}`;
      
      const diagnosticData = { 
        stage: 'PRE_DISPATCH',
        appId: process.env.NEXT_PUBLIC_WORLD_APP_ID || 'missing',
        config: { RECIPIENT, network: "worldchain", chainId: 4801 },
        payload: { reference: refId, to: RECIPIENT, token_amount: "10000" }
      };

      console.log('--- 🚀 DISPATCHING PAYMENT (V2.1) ---');
      console.log('--- ENVIANDO PAGO REAL (USDCE SEPOLIA) ---');
      const response = await MiniKit.commandsAsync.pay({
        reference: refId,
        to: RECIPIENT,
        tokens: [{
          symbol: "USDCE", // Literal string for Sepolia USDC
          token_amount: "10000", // 0.01 USDC = 10,000 units (6 decimals)
        }],
        network: "worldchain", // Testing without hyphen for worldchain native recognition
        chainId: 4801,
        description: "SciGate RAG Research Query",
      } as any);

      clearTimeout(timer);
      console.log('--- MINIKIT RESPONSE RECEIVED ---');
      
      const responseLog = { response, payload: (response as any).payload };
      await remoteLog('MINIKIT_PAYMENT_RESPONSE', responseLog);

      // ONLY AUTO-PROCEED ON SUCCESS
      if (response && (response as any).payload?.status === 'success') {
        setPaidPapers(prev => ({ ...prev, [paperId]: refId }));
        setNeedsPayment(false);
        setIsPaymentModalOpen(false); // SUCCESS: CLOSE MODAL
        setDebugInfo(null);
        
        setTimeout(() => {
          handleQuery(undefined, refId);
        }, 800);
      } else {
        const payload = (response as any).payload;
        const detail = payload?.status || "error o cancelación";
        setError(`❌ World App: ${detail}.`);
        setShowBypassButton(true); // SHOW MANUAL BYPASS BUTTON
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      clearTimeout(timer);
      const errorMessage = err.message || 'Error desconocido';
      setError(`❌ Error de MiniKit: ${errorMessage}`);
      setDebugInfo(JSON.stringify({ exception: errorMessage, stack: err.stack }, null, 2));
      setShowBypassButton(true);
    } finally {
      setPaymentLoading(false);
    }
  }

  return (
    <>
      {/* PREMIUM CHECKOUT MODAL */}
      {isPaymentModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div className="card" style={{
            maxWidth: 400, width: '100%', padding: '40px', textAlign: 'center',
            borderColor: 'var(--accent-indigo)', boxShadow: '0 0 50px rgba(99, 102, 241, 0.3)'
          }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>💳</div>
            <h2 style={{ marginBottom: 12 }}>SciGate Checkout</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 32, fontSize: 15 }}>
              Confirm your micropayment to unlock deep RAG analysis for this paper.
            </p>

            <div style={{ 
              background: 'rgba(255,255,255,0.03)', padding: 20, borderRadius: 12, 
              textAlign: 'left', marginBottom: 32, border: '1px solid var(--border-color)' 
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Amount</span>
                <span style={{ color: 'var(--accent-emerald)', fontWeight: 700 }}>0.01 USDC</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Network</span>
                <span>World Chain</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Protocol</span>
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>x402 Micropay</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button 
                className="btn-primary" 
                onClick={handlePayment}
                disabled={paymentLoading}
                style={{ width: '100%', background: 'linear-gradient(90deg, var(--accent-indigo), var(--accent-emerald))', border: 'none' }}
              >
                {paymentLoading ? '⏳ Confirming...' : '🚀 Confirm & Pay'}
              </button>
              
              <button 
                className="btn-secondary" 
                onClick={() => setIsPaymentModalOpen(false)}
                disabled={paymentLoading}
                style={{ width: '100%' }}
              >
                Cancel
              </button>

              {showBypassButton && (
                <button 
                  onClick={() => { setIsPaymentModalOpen(false); setNeedsPayment(false); setShowBypassButton(false); handleQuery(undefined); }}
                  style={{ width: '100%', borderColor: '#f59e0b', color: '#f59e0b', fontSize: 13, background: 'transparent', border: '1px solid', padding: '10px', marginTop: 10, cursor: 'pointer' }}
                >
                  ⚠️ Saltar Pago (Modo Demo)
                </button>
              )}
            </div>

            {error && <div style={{ color: '#f87171', fontSize: 13, marginTop: 16 }}>{error}</div>}

            {debugInfo && (
              <div style={{ 
                marginTop: 20, padding: 12, background: 'rgba(0,0,0,0.3)', 
                borderRadius: 8, textAlign: 'left', fontSize: 10, fontFamily: 'monospace',
                maxHeight: 150, overflowY: 'auto', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.1)'
              }}>
                <div style={{ color: 'var(--accent-indigo)', marginBottom: 4, fontWeight: 700 }}>DIAGNOSTIC LOG:</div>
                {debugInfo}
              </div>
            )}
          </div>
        </div>
      )}

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

      <main style={{ paddingTop: 100, minHeight: '100vh', paddingBottom: 60 }}>
        <div className="container">
          <div style={{ marginBottom: 48 }}>
            <h1 style={{ fontSize: 'clamp(32px, 4vw, 52px)', marginBottom: 12 }}>
              Explore <span className="gradient-text">Papers</span>
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 17 }}>
              Search academic papers. First 3 queries are free — then $0.01 USDC per query via x402.
            </p>
          </div>

          <form onSubmit={handleSearch} className="search-form">
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search: 'transformer models', 'biomedical RAG'..."
              style={{ flex: 1, fontSize: 15, padding: '14px 20px' }}
            />
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? '⏳' : '🔍'} Search
            </button>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 100 }}>
            {results.map((paper, i) => {
              const isSelected = getPaperId(selectedPaper) === getPaperId(paper);
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <div
                    className="card result-paper-item"
                    style={{ 
                      cursor: 'pointer', 
                      borderColor: isSelected ? 'var(--accent-indigo)' : 'rgba(255,255,255,0.05)',
                      padding: '24px',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      transform: isSelected ? 'scale(1.01)' : 'scale(1)',
                      background: isSelected ? 'rgba(99, 102, 241, 0.03)' : 'rgba(255,255,255,0.02)',
                      boxShadow: isSelected ? '0 12px 24px rgba(0,0,0,0.2)' : 'none',
                      borderRadius: isSelected ? 'var(--radius-md) var(--radius-md) 0 0' : 'var(--radius-md)'
                    }}
                    onClick={() => { 
                      if (isSelected) {
                        setSelectedPaper(null);
                      } else {
                        setSelectedPaper(paper); 
                        setAnswer(''); 
                        setQuestion(''); 
                      }
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                      <div>
                        <span className="badge badge-verified" style={{ marginBottom: 8, display: 'inline-block' }}>✓ World ID Verified</span>
                        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                          {paper.title || `Scientific Document ${getPaperId(paper).slice(0,6)}`}
                        </h2>
                      </div>
                      <span style={{ color: 'var(--accent-emerald)', fontSize: 14, fontWeight: 700 }}>$0.01/query</span>
                    </div>

                    <div style={{ 
                      background: 'white', color: '#1a1a1a', padding: '24px', borderRadius: '4px', 
                      boxShadow: 'inset 0 0 10px rgba(0,0,0,0.1)', fontFamily: '"Times New Roman", serif',
                      textAlign: 'justify', lineHeight: '1.5', fontSize: 13, marginBottom: 16,
                      border: '1px solid #ddd', maxHeight: '180px', overflow: 'hidden', position: 'relative'
                    }}>
                      <div style={{ fontWeight: 700, borderBottom: '1px solid #1a1a1a', marginBottom: 8, fontSize: 11, textAlign: 'center' }}>
                        PREVIEW REPLICA
                      </div>
                      {paper.snippet || 'Real abstract content not found.'}
                      <div style={{ 
                        position: 'absolute', bottom: 0, left: 0, right: 0, height: '40px', 
                        background: 'linear-gradient(to top, white, transparent)' 
                      }}></div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'monospace' }}>
                        Hash: {getPaperId(paper).slice(0, 16)}...
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Verified Paper • World Chain</span>
                    </div>
                  </div>

                  {/* INLINE AI INTERFACE (Only visible for selected paper) */}
                  {isSelected && (
                    <div className="card" style={{ 
                      borderTop: 'none', 
                      borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                      background: 'rgba(99, 102, 241, 0.05)',
                      borderColor: 'var(--accent-indigo)',
                      padding: '24px',
                      animation: 'slideDown 0.3s ease',
                      position: 'relative'
                    }}>
                      {/* Environment Badge */}
                      <div style={{ 
                        position: 'absolute', top: 10, right: 10, fontSize: 9, fontWeight: 800, 
                        background: (process.env.NEXT_PUBLIC_WORLD_APP_ID || '').includes('staging') || (process.env.NEXT_PUBLIC_WORLD_APP_ID || '').includes('aacdf') ? '#f59e0b' : '#3b82f6',
                        color: 'white', padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase'
                      }}>
                        {(process.env.NEXT_PUBLIC_WORLD_APP_ID || '').includes('staging') || (process.env.NEXT_PUBLIC_WORLD_APP_ID || '').includes('aacdf') ? 'Staging (Sepolia)' : 'Production (Mainnet)'}
                      </div>

                      <div style={{ padding: '0 0 16px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h3 style={{ margin: 0, fontSize: 16 }}>Ask NanoClaw AI</h3>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 10, background: 'rgba(16,185,129,0.1)', color: 'var(--accent-emerald)', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>x402</span>
                          </div>
                        </div>
                      </div>

                      <form onSubmit={handleQuery} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <textarea
                          className="input"
                          value={question}
                          onChange={(e) => { setQuestion(e.target.value); setShowBypassButton(false); }}
                          placeholder="Escribe tu pregunta para este documento..."
                          rows={3}
                          style={{ resize: 'none', background: 'rgba(255,255,255,0.03)', fontSize: 14 }}
                        />
                        
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button type="submit" className="btn-primary" disabled={answering || !question.trim()} style={{ flex: 1 }}>
                            {answering ? '🤔 Analizando...' : '🧪 Consultar RAG'}
                          </button>

                          {needsPayment && (
                            <button 
                              type="button"
                              className="btn-primary" 
                              onClick={() => setIsPaymentModalOpen(true)}
                              style={{ background: 'var(--accent-emerald)', border: 'none', color: 'white', flex: 1 }}
                            >
                              💳 Pagar $0.01
                            </button>
                          )}
                        </div>
                      </form>

                      {error && !isPaymentModalOpen && (
                        <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(239,68,68,0.05)', borderLeft: '3px solid #ef4444', color: '#f87171', fontSize: 13 }}>
                          {error}
                        </div>
                      )}

                      {answer && (
                        <div style={{
                          marginTop: 24, padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(99, 102, 241, 0.2)',
                          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%)'
                        }}>
                          <div style={{ fontSize: 11, color: 'var(--accent-indigo)', fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            ⚡ AI Analysis Result
                          </div>
                          <p style={{ color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{answer}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>
      
      <style jsx>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
