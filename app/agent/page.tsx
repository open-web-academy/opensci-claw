'use client';

import { useEffect, useState } from 'react';
import PayLinkCard from '@/components/PayLinkCard';
import AgentControl from '@/components/AgentControl';

interface AgentMetadata {
  title: string;
  author: string;
  priceUsdc: string;
}

/**
 * Global Agent Portal
 * Dedicated entry point for the Autonomous Research Agent gated by x402.
 */
export default function AgentGatePage() {
  const [metadata, setMetadata] = useState<AgentMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);

  const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

  useEffect(() => {
    async function fetchMetadata() {
      try {
        setLoading(true);
        // We use the 'agent' virtual ID
        const res = await fetch(`${SERVER_URL}/papers/agent/metadata`);
        if (!res.ok) throw new Error('Agent services unavailable at this node.');
        
        const data = await res.json();
        setMetadata({
          title: data.title || 'Global Researcher',
          author: data.author,
          priceUsdc: (Number(data.pricePerFull) / 1e6).toFixed(2),
        });
      } catch (err: any) {
        console.error('[AgentPortal] Metadata fetch failed:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchMetadata();
  }, [SERVER_URL]);

  return (
    <main className="min-h-screen bg-[#080b14] flex flex-col items-center justify-center p-6 selection:bg-indigo-500/30 overflow-hidden relative">
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-500/5 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] bg-violet-500/5 rounded-full blur-[120px]"></div>
      </div>

      <div className="w-full max-w-4xl flex flex-col items-center relative z-10">
        {loading ? (
          <div className="flex flex-col items-center gap-8 py-20">
            <div className="relative">
              <div className="w-20 h-20 border-2 border-indigo-500/20 rounded-full animate-ping absolute inset-0"></div>
              <div className="w-20 h-20 border-4 border-white/5 border-t-indigo-500 rounded-full animate-spin"></div>
            </div>
            <p className="text-white/20 text-[10px] uppercase tracking-[6px] font-black font-['Space_Grotesk']">
              Syncing with Autonomous Node...
            </p>
          </div>
        ) : error ? (
          <div className="card border-red-500/20 p-12 text-center max-w-sm animate-in fade-in zoom-in duration-500">
            <div className="text-5xl mb-6">🛰️</div>
            <h2 className="text-white font-bold mb-3 text-xl font-['Space_Grotesk']">Portal Offline</h2>
            <p className="text-white/40 text-sm leading-relaxed">{error}</p>
            <button 
              onClick={() => window.location.reload()}
              className="mt-8 btn-secondary py-3 px-8 text-xs"
            >
              Retry Connection
            </button>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center">
            {!unlocked ? (
              <div className="flex flex-col items-center gap-12 scale-110 lg:scale-125 transition-transform">
                <div className="text-center mb-4">
                  <h2 className="text-white/40 text-[10px] uppercase tracking-[8px] font-black mb-4 font-['Space_Grotesk']">SciGate Global Access</h2>
                  <div className="h-0.5 w-12 bg-indigo-500/30 mx-auto"></div>
                </div>
                
                <PayLinkCard
                  paperId="agent"
                  title={metadata!.title}
                  author={metadata!.author}
                  priceUsdc={metadata!.priceUsdc}
                  serverUrl={SERVER_URL}
                  onUnlock={(sig) => {
                    setSignature(sig);
                    setUnlocked(true);
                  }}
                />
                
                <p className="text-white/10 text-[9px] uppercase tracking-[4px] font-medium max-w-xs text-center leading-loose">
                  Unlocking this node grants full autonomous research capabilities across the entire cryptographically secured catalog.
                </p>
              </div>
            ) : (
              <div className="w-full animate-in fade-in slide-in-from-bottom-8 duration-1000">
                 <div className="mb-12 text-center">
                    <span className="badge badge-verified mb-4">Active Session: {signature?.slice(0,10)}...</span>
                    <h1 className="text-4xl font-black text-white font-['Space_Grotesk'] tracking-tight">NanoClaw Alpha Agent</h1>
                    <p className="text-white/30 text-sm mt-3">The researcher is standing by for your inquiry.</p>
                 </div>
                 
                 <div className="w-full bg-white/[0.02] border border-white/5 rounded-[40px] p-8 backdrop-blur-3xl shadow-2xl">
                    <AgentControl 
                      paymentSignature={signature!} 
                      serverUrl={SERVER_URL} 
                    />
                 </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Branded Logo */}
      <div className="fixed bottom-12 left-12 flex items-center gap-4 group">
         <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-xs font-black text-white group-hover:rotate-12 transition-transform shadow-lg shadow-indigo-500/40">S</div>
         <span className="text-[10px] font-black tracking-[6px] text-white opacity-20 group-hover:opacity-100 transition-opacity font-['Space_Grotesk']">SCIGATE AI PORTAL</span>
      </div>
    </main>
  );
}
