'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import PayLinkCard from '@/components/PayLinkCard';
import AgentControl from '@/components/AgentControl';

interface AgentMetadata {
  id: string;
  title: string;
  author: string;
  priceUsdc: string;
  description: string;
}

export default function AgentGatePage() {
  const [query, setQuery] = useState('');
  const [isSearched, setIsSearched] = useState(false);
  const [tiers, setTiers] = useState<AgentMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  
  const heroRef = useRef<HTMLDivElement>(null);
  const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

  // Replicate the mouse following effect from the Home page
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!heroRef.current) return;
      const rect = heroRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      heroRef.current.style.setProperty('--mx', `${x}%`);
      heroRef.current.style.setProperty('--my', `${y}%`);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const [resBasic, resFull] = await Promise.all([
        fetch(`${SERVER_URL}/papers/agent-query/metadata`),
        fetch(`${SERVER_URL}/papers/agent-full/metadata`)
      ]);
      const [basic, full] = await Promise.all([resBasic.json(), resFull.json()]);

      setTiers([
        {
          id: 'agent-query',
          title: 'Quick Inquiry',
          author: basic.author,
          priceUsdc: (Number(basic.pricePerFull) / 1e6).toFixed(2),
          description: 'Get a direct, synthesized answer to your specific prompt.'
        },
        {
          id: 'agent-full',
          title: 'Alpha Researcher',
          author: full.author,
          priceUsdc: (Number(full.pricePerFull) / 1e6).toFixed(2),
          description: 'Unlock the full autonomous agent loop with multi-source synthesis.'
        }
      ]);
      setIsSearched(true);
    } catch (err) {
      console.error('Failed to fetch agent tiers:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* ── Navbar (Native Platform Style) ─────────────────────────── */}
      <nav>
        <div className="nav-inner">
          <Link href="/" className="nav-logo">⬡ SciGate</Link>
          <ul className="nav-links">
            <li><Link href="/explore">Explore</Link></li>
            <li><Link href="/upload">Publish</Link></li>
            <li><Link href="/dashboard">Dashboard</Link></li>
          </ul>
        </div>
      </nav>

      <main 
        ref={heroRef}
        style={{
          minHeight: '100vh',
          background: 'var(--bg-primary)',
          position: 'relative',
          overflow: 'hidden',
          paddingTop: '120px',
          paddingBottom: '80px'
        }}
      >
        {/* Background Glowing Orbs (Native Style) */}
        <div className="hero-glow" style={{ width: 600, height: 600, top: '-100px', left: '-100px', background: 'rgba(99,102,241,0.12)' }} />
        <div className="hero-glow" style={{ width: 400, height: 400, bottom: 0, right: '-50px', background: 'rgba(139,92,246,0.08)', animationDelay: '2s' }} />
        <div className="hero-glow" style={{ width: 300, height: 300, top: '20%', right: '20%', background: 'rgba(6,182,212,0.06)', animationDelay: '1s' }} />

        <div className="container" style={{ position: 'relative', zIndex: 1 }}>
          {!unlocked ? (
            <div className="animate-fade-in-up flex flex-col items-center">
              <div className="text-center mb-12">
                <div className="badge badge-indigo" style={{ marginBottom: 24 }}>
                   <span>🤖</span> Edge Intelligence Gated by x402
                </div>
                <h1 style={{ fontSize: 'clamp(40px, 6vw, 72px)', marginBottom: 20 }}>
                  Meet <span className="gradient-text">NanoClaw</span>
                </h1>
                <p style={{ color: 'var(--text-secondary)', maxWidth: 600, margin: '0 auto', fontSize: '18px' }}>
                  The world's first agentic research node. Secured by World Chain and monetized through autonomous handshakes.
                </p>
              </div>

              {!isSearched ? (
                <div className="w-full max-w-2xl">
                   <form onSubmit={handleSearch} className="search-form">
                      <input 
                        className="input"
                        style={{ height: '60px', fontSize: '16px', paddingLeft: '24px' }}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="What should the researcher investigate?"
                        disabled={loading}
                      />
                      <button type="submit" className="btn-primary" disabled={loading || !query.trim()}>
                        {loading ? 'Initializing...' : 'Research'}
                      </button>
                   </form>
                   <div style={{ textAlign: 'center', opacity: 0.3 }}>
                      <span style={{ fontSize: '10px', letterSpacing: '4px', textTransform: 'uppercase', fontWeight: 800 }}>Autonomous Loop v2.5</span>
                   </div>
                </div>
              ) : (
                <div className="grid-responsive split" style={{ width: '100%', maxWidth: '1000px' }}>
                   {tiers.map((tier) => (
                     <div key={tier.id} className="animate-fade-in-up">
                        <div className="card" style={{ marginBottom: 24 }}>
                           <h3 style={{ fontSize: '18px', marginBottom: 8, color: 'var(--text-primary)' }}>{tier.title}</h3>
                           <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{tier.description}</p>
                           <div style={{ marginTop: 16 }}>
                              <span className="badge badge-verified" style={{ fontSize: '10px' }}>
                                Tier Access: {tier.priceUsdc} USDC
                              </span>
                           </div>
                        </div>
                        <PayLinkCard 
                          paperId={tier.id}
                          title={tier.title}
                          author={tier.author}
                          priceUsdc={tier.priceUsdc}
                          serverUrl={SERVER_URL}
                          onUnlock={(sig) => {
                            setSignature(sig);
                            setUnlocked(true);
                          }}
                        />
                     </div>
                   ))}
                </div>
              )}
            </div>
          ) : (
            <div className="animate-fade-in-up">
               <div className="card" style={{ marginBottom: 48, padding: '40px', textAlign: 'center' }}>
                  <div className="badge badge-verified" style={{ marginBottom: 16 }}>
                    Session Established: {signature?.slice(0,12)}...
                  </div>
                  <h2 style={{ fontSize: '32px', marginBottom: 8 }}>Investigating</h2>
                  <p className="gradient-text" style={{ fontSize: '24px', fontWeight: 800 }}>"{query}"</p>
               </div>
               
               <div className="card" style={{ padding: 0, overflow: 'hidden', background: 'rgba(13,17,23,0.8)' }}>
                  <AgentControl 
                    paymentSignature={signature!} 
                    serverUrl={SERVER_URL} 
                    initialTopic={query}
                  />
               </div>
            </div>
          )}
        </div>
      </main>

      <footer style={{ borderTop: '1px solid var(--border)', padding: '40px 0', background: 'var(--bg-secondary)', position: 'relative', zIndex: 1 }}>
        <div className="container" style={{ textAlign: 'center', opacity: 0.3 }}>
           <span style={{ fontSize: '10px', letterSpacing: '8px', fontWeight: 900, textTransform: 'uppercase' }}>SciGate x402 Ecosystem</span>
        </div>
      </footer>
    </>
  );
}
