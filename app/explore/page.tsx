'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MiniKit, Tokens } from '@worldcoin/minikit-js';

const API_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3001';
const RECIPIENT = process.env.NEXT_PUBLIC_PAY_TO_ADDRESS ?? '0x0000000000000000000000000000000000000000';

interface PaperResult {
  contentHash: string;
  metadataURI?: string;
  author?: string;
  pricePerQuery?: string;
  active?: boolean;
}

export default function ExplorePage() {
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

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError('');
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
    if (!selectedPaper || !question.trim()) return;
    setAnswering(true);
    setAnswer('');
    setError('');

    try {
      const res = await fetch(`/api/papers/${encodeURIComponent(selectedPaper.paper_id)}/query`, {
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
    setError('');

    try {
      if (!MiniKit.isInstalled()) {
        throw new Error('MiniKit is not installed. Please open in World App.');
      }

      // Safe Reference ID construction
      const paperIdShort = String(selectedPaper.paper_id || 'paper').slice(0, 8);
      const refId = `query_${paperIdShort}_${Date.now()}`;

      console.log("[MiniKit] Starting payment:", { refId, recipient: RECIPIENT });

      // x402 Payment request using MiniKit commands
      const response = await MiniKit.commandsAsync.pay({
        reference: refId,
        chainId: 4801, // World Chain Sepolia
        tokens: [{
          symbol: 'WLD', 
          amount: "0.01",
        }],
        recipient: RECIPIENT,
      } as any);
      
      console.log("[MiniKit] Full Payment Response:", response);
      
      const payload = (response as any).finalPayload;
      
      // --- HACKATHON DEMO BYPASS: Proceed if success OR if error (in simulator) ---
      if (response && (payload?.status === 'success' || payload?.status === 'error')) {
        if (payload?.status === 'error') {
          console.warn("[DEMO] Payment failed in simulator/testnet. Bypassing for presentation...");
          setError('⚠️ Simulator Mode: Payment mock-passed for demo.');
        } else {
          setError('✓ Payment successful! Retrying query...');
        }
        
        setNeedsPayment(false);
        // Small delay to let the user see the success message
        setTimeout(() => {
          handleQuery({ preventDefault: () => {} } as any);
        }, 500);
      } else {
        const detail = payload?.status || "cancelled/failed";
        throw new Error(`Payment ${detail}. Ensure you have balance in World App Simulator.`);
      }
    } catch (err: any) {
      console.error('Payment execution error:', err);
      const msg = err.message || "Unknown error";
      setError(`Payment error: ${msg.includes('length') ? 'MiniKit configuration error' : msg}`);
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
                    style={{ cursor: 'pointer', borderColor: selectedPaper?.paper_id === paper.paper_id ? 'var(--accent-indigo)' : undefined }}
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
                        Paper {paper.paper_id?.slice(0, 16)}...
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
