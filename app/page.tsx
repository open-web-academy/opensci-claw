'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

const FEATURES = [
  {
    icon: '💰',
    title: 'Instant USDC Micropayments',
    desc: 'Every AI query triggers an x402 payment directly to the author in USDC. No middlemen, no delays.',
  },
  {
    icon: '🪪',
    title: 'World ID Verification',
    desc: 'Authors verify they are unique humans with World ID Orb. No bots publishing fake papers.',
  },
  {
    icon: '🤖',
    title: 'AgentKit Integration',
    desc: 'AI agents get 3 free queries then pay via x402. Backed by real humans through AgentBook.',
  },
  {
    icon: '🧠',
    title: 'RAG-Powered Queries',
    desc: 'Agents ask questions in natural language. Never get the raw PDF — only smart, cited answers.',
  },
  {
    icon: '⛓️',
    title: 'On-Chain Registry',
    desc: 'PaperRegistry on World Chain tracks every paper, author, and earning immutably.',
  },
  {
    icon: '🌐',
    title: 'Dual-Network Payments',
    desc: 'Accept USDC on World Chain and Base simultaneously. Maximum liquidity for agents.',
  },
];

const STATS = [
  { label: 'Academic publishing market', value: '$37B', note: 'scientists get $0' },
  { label: 'Authors verified', value: '0 → ∞', note: 'with World ID Orb' },
  { label: 'Cost per AI query', value: '$0.01', note: 'instant USDC to author' },
  { label: 'Free trial queries', value: '3', note: 'per agent per paper' },
];

export default function HomePage() {
  const heroRef = useRef<HTMLDivElement>(null);

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

  return (
    <>
      {/* ── Navbar ─────────────────────────────────────────────────── */}
      <nav>
        <div className="nav-inner">
          <a href="/" className="nav-logo">⬡ SciGate</a>
          <ul className="nav-links">
            <li><Link href="/explore">Explore</Link></li>
            <li><Link href="/upload">Publish</Link></li>
            <li><Link href="/dashboard">Dashboard</Link></li>
          </ul>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section
        ref={heroRef}
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          paddingTop: '80px',
        }}
      >
        {/* Background glows */}
        <div className="hero-glow" style={{ width: 600, height: 600, top: '-100px', left: '-100px', background: 'rgba(99,102,241,0.12)' }} />
        <div className="hero-glow" style={{ width: 400, height: 400, bottom: 0, right: '-50px', background: 'rgba(139,92,246,0.08)', animationDelay: '2s' }} />
        <div className="hero-glow" style={{ width: 300, height: 300, top: '30%', right: '20%', background: 'rgba(6,182,212,0.06)', animationDelay: '1s' }} />

        <div className="container" style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <div className="badge badge-indigo" style={{ marginBottom: 24, display: 'inline-flex' }}>
            <span>🏆</span> World Build 3 Hackathon · April 2026
          </div>

          <h1 style={{ fontSize: 'clamp(48px, 7vw, 88px)', marginBottom: 24, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
            Every AI query
            <br />
            <span className="gradient-text">pays your research.</span>
          </h1>

          <p style={{ fontSize: 'clamp(18px, 2vw, 22px)', color: 'var(--text-secondary)', maxWidth: 640, margin: '0 auto 48px', lineHeight: 1.6 }}>
            Scientists publish academic papers and receive instant USDC micropayments via x402 every
            time an AI agent accesses their content. World ID ensures only real humans get paid.
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/upload" className="btn-primary" style={{ fontSize: 17, padding: '16px 36px' }}>
              🔬 Publish Your Paper
            </Link>
            <Link href="/explore" className="btn-secondary" style={{ fontSize: 17, padding: '16px 36px' }}>
              🔍 Explore Papers
            </Link>
          </div>

          {/* Floating badge showing tech stack */}
          <div style={{ marginTop: 64, display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            {['x402 v2', 'AgentKit', 'World ID', 'World Chain', 'Base', 'ChromaDB'].map((t) => (
              <span key={t} className="badge badge-indigo" style={{ fontSize: 12 }}>{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────────────── */}
      <section style={{ padding: '80px 0', borderTop: '1px solid var(--border)' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 32 }}>
            {STATS.map((s) => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div className="stat-number">{s.value}</div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginTop: 8 }}>{s.label}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>{s.note}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────── */}
      <section style={{ padding: '80px 0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 style={{ fontSize: 'clamp(32px, 4vw, 52px)', marginBottom: 16 }}>How SciGate works</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 18, maxWidth: 560, margin: '0 auto' }}>
              A complete payment layer between scientists and AI agents.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, maxWidth: 900, margin: '0 auto' }}>
            {[
              { step: '01', title: 'Scientist publishes', desc: 'Uploads PDF, verified by World ID Orb. Paper gets RAG-indexed and registered on-chain.' },
              { step: '02', title: 'Agent discovers', desc: 'Searches metadata for free. Gets 3 free RAG queries via AgentKit free-trial mode.' },
              { step: '03', title: 'Micropayment flows', desc: 'After free trial, each query costs $0.01 USDC via x402. Paid instantly to the scientist in World Chain USDC.' },
            ].map((item) => (
              <div key={item.step} className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 48, fontWeight: 900, color: 'var(--accent-indigo)', opacity: 0.3, fontFamily: 'Space Grotesk', marginBottom: 16 }}>
                  {item.step}
                </div>
                <h3 style={{ fontSize: 20, marginBottom: 12 }}>{item.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────── */}
      <section style={{ padding: '80px 0', background: 'var(--bg-secondary)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 style={{ fontSize: 'clamp(32px, 4vw, 52px)', marginBottom: 16 }}>Built on World's stack</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 18 }}>Every piece chosen for the hackathon spec.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            {FEATURES.map((f) => (
              <div key={f.title} className="card">
                <div style={{ fontSize: 36, marginBottom: 16 }}>{f.icon}</div>
                <h3 style={{ fontSize: 18, marginBottom: 10 }}>{f.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────── */}
      <section style={{ padding: '120px 0', textAlign: 'center' }}>
        <div className="container">
          <h2 style={{ fontSize: 'clamp(36px, 5vw, 64px)', marginBottom: 24 }}>
            Ready to monetize<br /><span className="gradient-text">your research?</span>
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 18, marginBottom: 48, maxWidth: 480, margin: '0 auto 48px' }}>
            Join the first wave of scientists getting paid by AI agents for their knowledge.
          </p>
          <Link href="/upload" className="btn-primary" style={{ fontSize: 17, padding: '18px 48px' }}>
            🚀 Start Publishing
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '32px 0', textAlign: 'center' }}>
        <div className="container">
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            SciGate · World Build 3 Hackathon 2026 · Built with x402 v2, AgentKit, World ID, and World Chain
          </p>
        </div>
      </footer>
    </>
  );
}
