'use client';

import { useState } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';
import { parseUnits, encodeFunctionData } from 'viem';

// Native USDC on World Chain (Mainnet)
const USDC_ADDRESS = '0x79A02482A880bCe3F13E09da970dC34dB4cD24D1';
const USDC_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
];

interface PayLinkCardProps {
  paperId: string;
  title: string;
  author: string;
  priceUsdc: string;
  serverUrl: string;
}

/**
 * PayLinkCard (Minimalista)
 * Maneja el flujo de pago x402 de forma directa.
 */
export default function PayLinkCard({ paperId, title, author, priceUsdc, serverUrl }: PayLinkCardProps) {
  const [status, setStatus] = useState<'idle' | 'charging' | 'verifying' | 'unlocked' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [content, setContent] = useState<string | null>(null);

  const handleUnlock = async () => {
    try {
      setStatus('charging');
      setErrorMsg('');

      // 1. Intentar acceder al recurso para obtener el desafío 402 si no lo tenemos
      console.log(`[PayLink] Requesting access to paper ${paperId}...`);
      const initialRes = await fetch(`${serverUrl}/papers/${paperId}/full`);
      
      // Si el servidor ya nos da el contenido (ej. ya pagamos o bypass), lo mostramos
      if (initialRes.status === 200) {
        const data = await initialRes.json();
        setContent(data.full_text);
        setStatus('unlocked');
        return;
      }

      if (initialRes.status !== 402) {
        throw new Error(`Unexpected server response: ${initialRes.status}`);
      }

      // 2. Parsear el desafío x402 (PAYMENT-REQUIRED header)
      const challengeHeader = initialRes.headers.get('PAYMENT-REQUIRED');
      if (!challengeHeader) throw new Error('Payment challenge header missing');
      
      const challenge = JSON.parse(atob(challengeHeader)); // Decodificar Base64
      const exactScheme = challenge.accepts.find((a: any) => a.scheme === 'exact');
      
      if (!exactScheme) throw new Error('No compatible payment scheme found');

      const amountUnits = BigInt(exactScheme.amount);
      const recipient = exactScheme.payTo;

      console.log(`[PayLink] Payment Required: ${exactScheme.amount} USDC to ${recipient}`);

      // 3. Ejecutar el pago con MiniKit
      if (!MiniKit.isInstalled()) {
        throw new Error('Please open this link inside the World App to complete the payment.');
      }

      const txData = encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [recipient, amountUnits],
      });

      const txResponse = await MiniKit.sendTransaction({
        transactions: [
          {
            to: USDC_ADDRESS,
            data: txData,
            value: '0',
          },
        ],
        chainId: 480, // World Chain Mainnet
      });

      const txId = (txResponse as any).data?.transactionId || (txResponse as any).data?.transactionHash;
      if (!txId) throw new Error('Transaction cancelled or failed.');

      console.log(`[PayLink] Payment sent: ${txId}. Verifying...`);
      setStatus('verifying');

      // 4. Re-intentar con la firma del pago (PAYMENT-SIGNATURE)
      const finalRes = await fetch(`${serverUrl}/papers/${paperId}/full`, {
        headers: {
          'PAYMENT-SIGNATURE': txId
        }
      });

      if (!finalRes.ok) {
        const errData = await finalRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Payment verification failed on server.');
      }

      const finalData = await finalRes.json();
      setContent(finalData.full_text);
      setStatus('unlocked');

    } catch (err: any) {
      console.error('[PayLink] Error:', err);
      setStatus('error');
      setErrorMsg(err.message || 'Payment process failed.');
    }
  };

  if (status === 'unlocked' && content) {
    return (
      <div className="w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-[32px] p-8 shadow-2xl animate-in fade-in zoom-in duration-500">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center text-xl">✓</div>
          <h2 className="text-xl font-bold text-white">Full Access Granted</h2>
        </div>
        <div className="prose prose-invert max-w-none">
          <p className="text-white/70 whitespace-pre-wrap font-mono text-sm leading-relaxed bg-white/5 p-6 rounded-2xl border border-white/5">
            {content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-[40px] p-10 shadow-[0_0_50px_-12px_rgba(99,102,241,0.2)] backdrop-blur-xl relative overflow-hidden group">
      {/* Background Glow */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all duration-700"></div>
      
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-10">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-3xl shadow-xl shadow-indigo-500/20">
            📄
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-[3px] font-black text-indigo-400 block mb-1">Price</span>
            <span className="text-2xl font-black text-white">{priceUsdc} <span className="text-xs text-white/40">USDC</span></span>
          </div>
        </div>

        <h1 className="text-2xl font-black text-white mb-3 leading-tight leading-tight">
          {title}
        </h1>
        
        <p className="text-white/40 text-xs mb-10 font-medium tracking-wide">
          AUTHOR: <span className="text-white/60">{author.slice(0, 6)}...{author.slice(-4)}</span>
        </p>

        {status === 'error' && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-xs mb-8 animate-shake">
             ⚠️ {errorMsg}
          </div>
        )}

        <button
          onClick={handleUnlock}
          disabled={status === 'charging' || status === 'verifying'}
          className="w-full h-16 bg-white hover:bg-gray-100 disabled:bg-white/10 disabled:text-white/20 text-black font-black rounded-2xl transition-all shadow-xl flex items-center justify-center gap-3 relative overflow-hidden group/btn"
        >
          {status === 'charging' ? 'WAITING FOR WALLET...' : 
           status === 'verifying' ? 'VERIFYING ON-CHAIN...' : 
           'UNLOCK RESEARCH'}
          
          {status === 'idle' && (
             <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/btn:animate-shimmer"></div>
          )}
        </button>

        <div className="mt-8 flex items-center justify-center gap-2 opacity-20 group-hover:opacity-40 transition-opacity">
           <span className="text-[8px] uppercase tracking-[4px] font-bold text-white">Secure x402 Protocol</span>
        </div>
      </div>
    </div>
  );
}
