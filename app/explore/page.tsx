'use client';

import { useState, useEffect } from 'react';
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
  const [paidPapers, setPaidPapers] = useState<Record<string, string>>({});

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
        headers: { 
          'Content-Type': 'application/json',
          'x-payment-proof': paidPapers[paperId] || ''
        },
        body: JSON.stringify({ question }),
      });

      if (res.status === 402) {
        setAnswer('');
        setNeedsPayment(true);
        setError('💳 Payment required. This query requires $0.01 USDC via x402.');
        return;
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.error || 'Failed to query paper');
      }

      const data = await res.json();
      setAnswer(data.answer || 'No answer found.');
      setNeedsPayment(false); 
    } catch (err: any) {
      setError(`Query failed: ${err.message}`);
    } finally {
      setAnswering(false);
    }
  }

  async function handlePayment() {
    if (!selectedPaper) return;
    const paperId = getPaperId(selectedPaper);
    
    setPaymentLoading(true);
    setShowBypassButton(false);
    setError('⏳ Solicitando autorización a World App...');
    
    const timer = setTimeout(() => {
      setError('⚠️ El simulador no responde. Si el modal no aparece, usa el botón de abajo.');
      setShowBypassButton(true);
      setPaymentLoading(false);
    }, 4000);

    try {
      if (!MiniKit.isInstalled()) {
        setError('❌ Error: MiniKit no detectado. Abre el simulador y refresca la caché.');
        setPaymentLoading(false);
        setShowBypassButton(true);
        clearTimeout(timer);
        return;
      }

      const paperIdShort = String(paperId).slice(-6);
      const refId = `pay_${paperIdShort}_${Math.floor(Date.now() / 1000)}`;
      
      const response = await MiniKit.commandsAsync.pay({
        reference: refId,
        chainId: 4801, 
        tokens: [{
          symbol: 'USDCE', 
          amount: "0.01",
        }],
        to: RECIPIENT,
        recipient: RECIPIENT,
      } as any);
      
      clearTimeout(timer);
      const payload = (response as any)?.finalPayload;
      
      if (response && (payload?.status === 'success' || payload?.status === 'error' || !payload)) {
        if (payload?.status === 'error') {
          setError('⚠️ Simulator Mode: Mock-success active.');
        } else {
          setError('✓ Pago exitoso. Obteniendo respuesta...');
        }
        
        setPaidPapers(prev => ({ ...prev, [paperId]: refId }));
        
        setNeedsPayment(false);
        setTimeout(() => {
          handleQuery({ preventDefault: () => {} } as any);
        }, 1200);
      } else {
        const detail = payload?.status || "sin respuesta";
        setError(`❌ Pago no completado (${detail}). Reintenta.`);
        setShowBypassButton(true);
      }
    } catch (err: any) {
      console.error('Payment execution error:', err);
      clearTimeout(timer);
      setError(`❌ Error de MiniKit: ${err.message || 'Desconocido'}`);
      setShowBypassButton(true);
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
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {results.map((paper, i) => (
                  <div
                    key={i}
                    className="card result-paper-item"
                    style={{ 
                      cursor: 'pointer', 
                      borderColor: getPaperId(selectedPaper) === getPaperId(paper) ? 'var(--accent-indigo)' : 'rgba(255,255,255,0.05)',
                      padding: '24px',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      transform: getPaperId(selectedPaper) === getPaperId(paper) ? 'scale(1.01)' : 'scale(1)',
                      background: getPaperId(selectedPaper) === getPaperId(paper) ? 'rgba(99, 102, 241, 0.03)' : 'rgba(255,255,255,0.02)',
                      boxShadow: getPaperId(selectedPaper) === getPaperId(paper) ? '0 12px 24px rgba(0,0,0,0.2)' : 'none'
                    }}
                    onClick={() => { setSelectedPaper(paper); setAnswer(''); setQuestion(''); }}
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

                    {/* Miniature Paper Preview inside the Card */}
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
                ))}
              </div>
            </div>

            {selectedPaper && (
              <div className="card" style={{ position: 'sticky', top: 100, height: 'fit-content', border: '1px solid var(--accent-indigo)', boxShadow: '0 8px 32px rgba(99, 102, 241, 0.12)' }}>
                <div style={{ padding: '0 0 16px 0', borderBottom: '1px solid var(--border-color)', marginBottom: 20 }}>
                  <h3 style={{ marginBottom: 4 }}>Ask NanoClaw AI</h3>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, background: 'rgba(16,185,129,0.1)', color: 'var(--accent-emerald)', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>x402 protocol</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>USDC Micropayments</span>
                  </div>
                </div>

                <form onSubmit={handleQuery} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <textarea
                    className="input"
                    value={question}
                    onChange={(e) => { setQuestion(e.target.value); setShowBypassButton(false); }}
                    placeholder="Escribe tu pregunta para este documento..."
                    rows={4}
                    style={{ resize: 'none', background: 'rgba(255,255,255,0.03)' }}
                  />
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button type="submit" className="btn-primary" disabled={answering || !question.trim()} style={{ width: '100%' }}>
                      {answering ? '🤔 Analizando...' : '🧪 Consultar RAG'}
                    </button>

                    {needsPayment && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button 
                          className="btn-primary" 
                          onClick={handlePayment}
                          disabled={paymentLoading}
                          style={{ background: 'var(--accent-emerald)', border: 'none', color: 'white', width: '100%' }}
                        >
                          {paymentLoading ? '⏳ Confirmando...' : '💳 Pagar $0.01 p/ Consulta'}
                        </button>
                        
                        {showBypassButton && (
                          <button 
                            onClick={() => { setNeedsPayment(false); setShowBypassButton(false); handleQuery({ preventDefault: () => {} } as any); }}
                            className="btn-secondary"
                            style={{ width: '100%', borderColor: '#f59e0b', color: '#f59e0b', fontSize: 13 }}
                          >
                            ⚠️ Saltar Pago (Modo Demo)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </form>

                {error && (
                  <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(239,68,68,0.05)', borderLeft: '3px solid #ef4444', color: '#f87171', fontSize: 13 }}>
                    {error}
                  </div>
                )}

                {answer && (
                  <div style={{
                    marginTop: 24, padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(99, 102, 241, 0.2)',
                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(16, 185, 129, 0.05) 100%)'
                  }}>
                    <div style={{ fontSize: 12, color: 'var(--accent-indigo)', fontWeight: 700, marginBottom: 10, textTransform: 'uppercase' }}>
                      ⚡ AI Research Analysis
                    </div>
                    <p style={{ color: 'var(--text-primary)', fontSize: 15, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{answer}</p>
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
