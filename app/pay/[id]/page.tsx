'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import PayLinkCard from '@/components/PayLinkCard';

interface PaperMetadata {
  title: string;
  author: string;
  pricePerFull: string;
  isLocal: boolean;
}

/**
 * PayLink Page (Minimalista)
 * Punto de entrada para compartir enlaces directos de cobro x402.
 */
export default function PayLinkPage() {
  const params = useParams();
  const id = params.id as string;
  
  const [metadata, setMetadata] = useState<PaperMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

  useEffect(() => {
    async function fetchMetadata() {
      try {
        setLoading(true);
        const res = await fetch(`${SERVER_URL}/papers/${id}/metadata`);
        if (!res.ok) throw new Error('Paper not found in SciGate registry');
        
        const data = await res.json();
        setMetadata({
          title: data.title || 'Untitled Research',
          author: data.author,
          pricePerFull: (Number(data.pricePerFull) / 1e6).toFixed(2), // Convert from 6 decimals
          isLocal: !!data.isLocal
        });
      } catch (err: any) {
        console.error('[PayLink] Metadata fetch failed:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (id) fetchMetadata();
  }, [id, SERVER_URL]);

  return (
    <main className="min-h-screen bg-black flex items-center justify-center p-6 selection:bg-indigo-500/30">
      {/* Background Decorative Element */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[20%] left-[10%] w-[40%] h-[40%] bg-indigo-900/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[20%] right-[10%] w-[30%] h-[30%] bg-purple-900/10 rounded-full blur-[120px]"></div>
      </div>

      <div className="w-full flex justify-center relative z-10">
        {loading ? (
          <div className="flex flex-col items-center gap-6">
            <div className="w-16 h-16 border-4 border-white/5 border-t-indigo-500 rounded-full animate-spin"></div>
            <p className="text-white/20 text-[10px] uppercase tracking-[4px] font-bold">Initializing x402 Node...</p>
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/20 p-8 rounded-[32px] text-center max-w-sm">
            <div className="text-4xl mb-4">📍</div>
            <h2 className="text-white font-bold mb-2">Resource Unavailable</h2>
            <p className="text-white/40 text-sm">{error}</p>
          </div>
        ) : metadata ? (
          <PayLinkCard
            paperId={id}
            title={metadata.title}
            author={metadata.author}
            priceUsdc={metadata.pricePerFull}
            serverUrl={SERVER_URL}
          />
        ) : null}
      </div>

      {/* Floating Logo (Discreet) */}
      <div className="fixed bottom-8 left-8 mix-blend-difference">
         <span className="text-[10px] font-black tracking-[6px] text-white opacity-20 hover:opacity-100 transition-opacity cursor-default">SCIGATE PAYLINK</span>
      </div>
    </main>
  );
}
