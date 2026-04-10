'use client';

import { useState, useEffect } from 'react';
import { MiniKit, Tokens } from '@worldcoin/minikit-js';
import Link from 'next/link';
import { useReadContract } from 'wagmi';
import { PAPER_REGISTRY_ABI } from '@/config/abi';

const API_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3001';
const PAPER_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_PAPER_REGISTRY_ADDRESS;

const MOCK_PAPERS = [
  { contentHash: '0xabcd1234...', title: 'Attention Is All You Need', totalEarnings: '145000', totalAccesses: 14, active: true },
  { contentHash: '0xdeef5678...', title: 'BERT: Pre-training Deep Bidirectional Transformers', totalEarnings: '87000', totalAccesses: 8, active: true },
];

function usdcToDisplay(atomic: string) {
  return (parseInt(atomic, 10) / 1_000_000).toFixed(2);
}

export default function DashboardPage() {
  const [walletAddress, setWalletAddress] = useState('');
  const [papers, setPapers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [totalAccesses, setTotalAccesses] = useState(0);
  const [useMock, setUseMock] = useState(false);

  // 1. Fetch papers from Centralized API (which merges Mock DB + Blockchain)
  async function loadDashboard() {
    if (!walletAddress) return;
    setLoading(true);
    setUseMock(false);
    try {
      const res = await fetch(`/api/authors/${walletAddress}/papers`);
      if (!res.ok) throw new Error('Failed to fetch dashboard data');
      const data = await res.json();
      
      const ps = data.papers || [];
      if (ps.length === 0) {
        setPapers([]);
        setTotalEarnings(0);
        setTotalAccesses(0);
        return;
      }

      let earnings = 0;
      let accesses = 0;

      for (const p of ps) {
        earnings += parseInt(p.totalEarnings ?? '0', 10);
        accesses += parseInt(String(p.totalAccesses ?? '0'), 10);
      }

      setPapers(ps);
      setTotalEarnings(earnings);
      setTotalAccesses(accesses);
    } catch (err) {
      console.error('Dashboard load error:', err);
      // Only show mock MOCK_PAPERS if the backend crashes entirely or the user clicked "Use demo data"
      if (walletAddress === '0x0000000000000000000000000000000000000001') {
        setUseMock(true);
        setPapers(MOCK_PAPERS);
      } else {
        setPapers([]);
      }
    } finally {
      setLoading(false);
    }
  }

  const [miniKitNotInstalled, setMiniKitNotInstalled] = useState(false);

  // Auto-detect wallet from MiniKit on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (MiniKit.user?.walletAddress) {
        setWalletAddress(MiniKit.user.walletAddress);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleDetectWallet = async () => {
    if (!MiniKit.isInstalled()) {
      setMiniKitNotInstalled(true);
      return;
    }
    try {
      if (MiniKit.user?.walletAddress) {
        setWalletAddress(MiniKit.user.walletAddress);
        return;
      }
      const res = await MiniKit.commandsAsync.walletAuth({
        nonce: Date.now().toString(),
        requestId: 'auth_detect_dash',
        expirationTime: new Date(Date.now() + 60 * 60 * 1000),
      });
      if (res.finalPayload.status === 'success' && res.finalPayload.address) {
        setWalletAddress(res.finalPayload.address);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  // Reload when wallet is confirmed
  useEffect(() => {
    if (walletAddress && walletAddress !== '0x0000000000000000000000000000000000000001') {
      loadDashboard();
    }
  }, [walletAddress]);

  const SUMMARY_CARDS = [
    { label: 'Total Earned', value: `$${usdcToDisplay(String(totalEarnings))}`, unit: 'USDC', icon: '💰', color: 'var(--accent-emerald)' },
    { label: 'Total Accesses', value: String(totalAccesses), unit: 'queries', icon: '🔍', color: 'var(--accent-indigo)' },
    { label: 'Papers Published', value: String(papers.length), unit: 'papers', icon: '📄', color: 'var(--accent-violet)' },
    { label: 'Avg per Query', value: totalAccesses > 0 ? `$${usdcToDisplay(String(Math.round(totalEarnings / totalAccesses)))}` : '$0.00', unit: 'USDC', icon: '📈', color: 'var(--accent-cyan)' },
  ];

  return (
    <>
      <nav>
        <div className="nav-inner">
          <Link href="/" className="nav-logo">⬡ SciGate</Link>
          <ul className="nav-links">
            <li><Link href="/explore">Explore</Link></li>
            <li><Link href="/upload">Publish</Link></li>
            <li><Link href="/dashboard" style={{ color: 'var(--text-primary)' }}>Dashboard</Link></li>
          </ul>
        </div>
      </nav>

      <main style={{ paddingTop: 100, minHeight: '100vh', paddingBottom: 80 }}>
        <div className="container">
          <div style={{ marginBottom: 48 }}>
            <h1 style={{ fontSize: 'clamp(32px, 4vw, 48px)', marginBottom: 12 }}>
              Earnings <span className="gradient-text">Dashboard</span>
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 17 }}>
              Track your USDC earnings from AI agent queries in real time.
            </p>
          </div>

          {/* Wallet Connection State */}
          {!walletAddress && !loading && (
            <div className="card" style={{ maxWidth: 560, marginBottom: 40 }}>
              <h3 style={{ marginBottom: 16 }}>Connect your wallet</h3>
              
              {miniKitNotInstalled ? (
                <div style={{ display: 'flex', gap: 12 }}>
                  <input
                    className="input"
                    value={walletAddress}
                    onChange={(e) => setWalletAddress(e.target.value)}
                    placeholder="0x your wallet address..."
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn-primary"
                    onClick={() => { if (walletAddress) loadDashboard(); }}
                    disabled={!walletAddress}
                  >
                    Load
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
                    We automatically load your earnings directly from the PaperRegistry contract.
                  </p>
                  <button className="btn-primary" onClick={handleDetectWallet} style={{ width: '100%', padding: '14px' }}>
                    Connect World App Wallet →
                  </button>
                </div>
              )}
              
              <button
                onClick={() => { setWalletAddress('0x0000000000000000000000000000000000000001'); setTimeout(loadDashboard, 0); }}
                style={{ marginTop: 24, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
              >
                Use demo data for presentation
              </button>
            </div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
              <p>Loading your earnings...</p>
            </div>
          )}

          {walletAddress && !loading && (
            <>
              {useMock && (
                <div style={{ padding: '10px 16px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--accent-amber)', fontSize: 13, marginBottom: 24 }}>
                  📊 Showing demo data — connect your real wallet to see live earnings from PaperRegistry
                </div>
              )}

              {/* Connected Wallet Info */}
              <div style={{ marginBottom: 32, padding: '12px 16px', background: 'rgba(16,185,129,0.06)', borderRadius: 'var(--radius-md)', fontSize: 14, color: 'var(--accent-emerald)', border: '1px solid rgba(16,185,129,0.2)' }}>
                ✓ Connected Wallet: {walletAddress.slice(0, 10)}...{walletAddress.slice(-6)}
              </div>

              {/* Summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 40 }}>
                {SUMMARY_CARDS.map((card) => (
                  <div key={card.label} className="card" style={{ padding: '16px' }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>{card.icon}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: card.color, fontFamily: 'Space Grotesk' }}>{card.value}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{card.label}</div>
                  </div>
                ))}
              </div>

              {/* Papers table */}
              <div className="card">
                <h3 style={{ marginBottom: 24 }}>Your Papers</h3>
                
                {papers.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                    <p>No papers published yet.</p>
                    <Link href="/upload" style={{ color: 'var(--accent-indigo)', textDecoration: 'underline', marginTop: 8, display: 'inline-block' }}>Publish your first paper</Link>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {papers.map((paper: any) => (
                      <div key={paper.contentHash} className="grid-responsive" style={{
                        padding: '16px 20px',
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border)',
                        gap: 16,
                      }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>{paper.title ?? 'Untitled'}</div>
                          <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                            {String(paper.contentHash).slice(0, 24)}...
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>
                              ${usdcToDisplay(String(paper.totalEarnings ?? 0))}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>earned</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 700 }}>{paper.totalAccesses ?? 0}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>queries</div>
                          </div>
                          <span className={`badge ${paper.active ? 'badge-verified' : 'badge-amber'}`}>
                            {paper.active ? '✓ Active' : '⏸ Paused'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
                <button className="btn-secondary" onClick={() => { setPapers([]); setWalletAddress(''); }}>
                  ← Disconnect
                </button>
                <button className="btn-primary" onClick={() => loadDashboard()} disabled={loading}>
                  🔄 Refresh
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
