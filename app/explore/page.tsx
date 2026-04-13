'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MiniKit } from '@worldcoin/minikit-js';
import { encodeFunctionData, parseAbi } from 'viem';

const USDC_CONTRACT = "0x79A02482A880bCe3F13E09da970dC34dB4cD24D1";
const USDC_ABI = parseAbi(['function transfer(address to, uint256 value) public returns (bool)']);

const API_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3001';
const RECIPIENT = process.env.NEXT_PUBLIC_PAY_TO_ADDRESS ?? '0xc813c372D8123C1D8727d37f037F5a25f2173826';

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

  useEffect(() => {
    // MiniKit logging for production
    if (MiniKit.isInstalled()) {
      console.log('--- ⬡ SciGate Production Mode Active ---');
    }
  }, []);

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

      const paymentReference = `order_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`;
      console.log('--- 🚀 DISPATCHING PAYMENT MODAL (World Chain Mainnet) ---');
      await remoteLog('PAYMENT_START', { 
        paperId, 
        reference: paymentReference,
        to: RECIPIENT,
        token: 'USDC'
      });

      const response = await MiniKit.pay({
        reference: paymentReference,
        to: RECIPIENT,
        tokens: [{ 
          symbol: 'USDC' as any, 
          token_amount: '0.01' 
        }],
        network: 'worldchain' as any,
        description: `Unlock Paper: ${selectedPaper.title || paperId}`,
      });

      clearTimeout(timer);
      
      await remoteLog('MINIKIT_PAY_RESPONSE', { transactionId: response?.data?.transactionId });

      if (response && response.data && response.data.transactionId) {
        const hash = response.data.transactionId;
        console.log('✅ Payment Success! Hash:', hash);
        setPaidPapers(prev => ({ ...prev, [paperId]: hash }));
        setNeedsPayment(false);
        setIsPaymentModalOpen(false);
        await handleQuery(undefined, hash); 
        return;
      } else {
        throw new Error('Payment failed or cancelled');
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      clearTimeout(timer);
      setPaymentLoading(false);
      setError(err.message || 'Error en el proceso de pago');
      await remoteLog('PAYMENT_EXCEPTION', { error: err.message, stack: err.stack });
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
                <span>World Chain Mainnet</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Protocol</span>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent-indigo)' }}>x402 USDC Micropay</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button 
                className="btn-primary" 
                onClick={handlePayment} 
                disabled={paymentLoading}
                style={{ background: 'var(--accent-emerald)', border: 'none', color: 'white' }}
              >
                {paymentLoading ? 'Confirmando...' : 'Pagar 0.01 USDC'}
              </button>
              
              <button className="btn-secondary" onClick={() => setIsPaymentModalOpen(false)} style={{ width: '100%' }}>
                Cancelar
              </button>
            </div>

            {error && <div style={{ color: '#f87171', fontSize: 13, marginTop: 16 }}>{error}</div>}
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
                        background: '#3b82f6',
                        color: 'white', padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase'
                      }}>
                        Production (Mainnet)
                      </div>

                      <div style={{ padding: '0 0 16px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h3 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 20 }}>🧬</span> Ask NanoClaw AI
                          </h3>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 10, background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-indigo)', padding: '2px 8px', borderRadius: 4, fontWeight: 700, border: '1px solid rgba(99,102,241,0.2)' }}>X402 PROTOCOL</span>
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
