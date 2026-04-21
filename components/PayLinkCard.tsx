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
  const [logs, setLogs] = useState<{msg: string, type: 'info' | 'success' | 'warn' | 'error', detail?: string}[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  const addLog = (msg: string, type: 'info' | 'success' | 'warn' | 'error' = 'info', detail?: string) => {
    setLogs(prev => [...prev, { msg, type, detail }]);
    console.log(`[x402 LOG] ${msg}`, detail || '');
  };

  const handleUnlock = async () => {
    try {
      setStatus('charging');
      setErrorMsg('');
      setShowLogs(true);
      setLogs([]);

      // 1. Intentar acceder al recurso para obtener el desafío 402 si no lo tenemos
      addLog('Iniciando Handshake HTTP...', 'info', `GET ${serverUrl}/papers/${paperId}/full`);
      const initialRes = await fetch(`${serverUrl}/papers/${paperId}/full`);
      
      // Si el servidor ya nos da el contenido (ej. ya pagamos o bypass), lo mostramos
      if (initialRes.status === 200) {
        addLog('Conexión establecida. Acceso directo concedido.', 'success');
        const data = await initialRes.json();
        setContent(data.full_text);
        setStatus('unlocked');
        return;
      }

      if (initialRes.status !== 402) {
        addLog(`Error inesperado: HTTP ${initialRes.status}`, 'error');
        throw new Error(`Unexpected server response: ${initialRes.status}`);
      }

      addLog('HTTP 402 Detectado: Pago Requerido.', 'warn');

      // 2. Parsear el desafío x402 (PAYMENT-REQUIRED header)
      const challengeHeader = initialRes.headers.get('PAYMENT-REQUIRED');
      if (!challengeHeader) {
        addLog('Falta header PAYMENT-REQUIRED', 'error');
        throw new Error('Payment challenge header missing');
      }
      
      addLog('Analizando Challenge x402...', 'info', challengeHeader);
      const challenge = JSON.parse(atob(challengeHeader)); // Decodificar Base64
      const exactScheme = challenge.accepts.find((a: any) => a.scheme === 'exact');
      
      if (!exactScheme) throw new Error('No compatible payment scheme found');

      const amountUnits = BigInt(exactScheme.amount);
      const recipient = exactScheme.payTo;

      addLog(`Challenge Decodificado: ${exactScheme.amount / 1e6} USDC -> ${recipient.slice(0,10)}...`, 'success');

      // 3. Ejecutar el pago con MiniKit
      if (!MiniKit.isInstalled()) {
        addLog('MiniKit no detectado. Abre esto en World App.', 'error');
        throw new Error('Please open this link inside the World App to complete the payment.');
      }

      addLog('Invocando SDK de Worldcoin (MiniKit)...', 'info');
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
      if (!txId) {
        addLog('Transacción cancelada por el usuario.', 'warn');
        throw new Error('Transaction cancelled or failed.');
      }

      addLog('Transacción Enviada!', 'success', txId);
      addLog('Verificando pago on-chain...', 'info');
      setStatus('verifying');

      // 4. Re-intentar con la firma del pago (PAYMENT-SIGNATURE)
      const finalRes = await fetch(`${serverUrl}/papers/${paperId}/full`, {
        headers: {
          'PAYMENT-SIGNATURE': txId
        }
      });

      if (!finalRes.ok) {
        addLog('Fallo en la verificación del servidor.', 'error');
        const errData = await finalRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Payment verification failed on server.');
      }

      addLog('Verificación Completada. ¡Acceso Total!', 'success');
      const finalData = await finalRes.json();
      setContent(finalData.full_text);
      setStatus('unlocked');

    } catch (err: any) {
      addLog(`Fallo en el protocolo: ${err.message}`, 'error');
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
    <div className="w-full max-w-md card relative overflow-hidden group border-white/5 bg-gradient-to-b from-white/[0.03] to-transparent">
      {/* Background Glows (Platform Style) */}
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-500/10 rounded-full blur-[100px] group-hover:bg-indigo-500/20 transition-all duration-1000"></div>
      <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none"></div>
      
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-600 to-indigo-700 flex items-center justify-center text-3xl shadow-[0_0_30px_rgba(99,102,241,0.3)] border border-white/20">
            📄
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-[4px] font-black text-indigo-400/80 block mb-1 font-['Space_Grotesk']">Bounty</span>
            <span className="text-3xl font-black text-white tracking-tighter font-['Space_Grotesk']">
              {priceUsdc} <span className="text-xs text-white/30 font-medium">USDC</span>
            </span>
          </div>
        </div>

        <div className="mb-8">
           <span className="badge badge-indigo mb-3">⬡ Verified Paper</span>
           <h1 className="text-2xl font-bold text-white mb-2 leading-tight font-['Space_Grotesk']">
            {title}
           </h1>
           <div className="flex items-center gap-2 group/author cursor-help">
             <span className="text-[10px] text-white/30 uppercase tracking-[2px] font-bold">Author:</span>
             <span className="text-[11px] font-mono text-indigo-300/60 group-hover/author:text-indigo-300 transition-colors">
               {author.slice(0, 8)}...{author.slice(-6)}
             </span>
           </div>
        </div>

        {status === 'error' && (
          <div className="p-4 bg-red-500/10 border border-red-500/10 rounded-xl text-red-400 text-[11px] mb-8 animate-shake font-medium flex gap-3 items-center">
             <span className="text-lg">⚠️</span> {errorMsg}
          </div>
        )}

        {status !== 'unlocked' && (
          <button
            onClick={handleUnlock}
            disabled={status === 'charging' || status === 'verifying'}
            className="w-full h-16 bg-white hover:bg-gray-100 disabled:bg-white/5 disabled:text-white/10 text-black font-black rounded-2xl transition-all shadow-xl flex items-center justify-center gap-3 relative overflow-hidden group/btn font-['Space_Grotesk'] text-sm tracking-widest"
          >
            {status === 'charging' ? 'INITIATING X402...' : 
            status === 'verifying' ? 'FINAL HANDSHAKE...' : 
            'PURCHASE ACCESS'}
            
            {(status === 'idle' || status === 'error') && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover/btn:animate-shimmer"></div>
            )}
          </button>
        )}

        {/* --- PREMIUM PROTOCOL HANDSHAKE VISUALIZER --- */}
        {showLogs && (
          <div className="mt-8 border-t border-white/5 pt-6 animate-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center justify-between mb-5">
               <div className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                 <span className="text-[9px] font-black tracking-[3px] text-white/40 uppercase font-['Space_Grotesk']">Deep Protocol Log</span>
               </div>
               <div className="text-[9px] text-emerald-500/60 font-mono tracking-tighter">SECURE_NODE_ACTIVE</div>
            </div>
            
            <div className="space-y-4 max-h-[220px] overflow-y-auto no-scrollbar pb-2">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-4 items-start group/log animate-in fade-in slide-in-from-left-2 duration-300" style={{ animationDelay: `${i * 0.1}s` }}>
                  <div className={`mt-1.5 w-1 h-1 rounded-full shrink-0 ${
                    log.type === 'success' ? 'bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,1)]' :
                    log.type === 'warn' ? 'bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]' :
                    log.type === 'error' ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-indigo-500/50'
                  }`} />
                  <div className="flex flex-col gap-1.5 flex-1">
                    <p className={`text-[11px] font-bold tracking-tight ${
                      log.type === 'success' ? 'text-emerald-400' :
                      log.type === 'warn' ? 'text-amber-300' :
                      log.type === 'error' ? 'text-red-400' : 'text-white/70'
                    }`}>
                      {log.msg}
                    </p>
                    {log.detail && (
                      <div className="relative group/detail">
                        <div className="absolute -left-2 top-0 bottom-0 w-[1px] bg-white/5 group-hover/detail:bg-indigo-500/20 transition-colors" />
                        <p className="text-[9px] font-mono text-white/20 break-all leading-relaxed pl-2 group-hover/log:text-white/40 transition-colors uppercase tracking-tight">
                          {log.detail}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div className="h-4" /> {/* Spacer */}
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center justify-center gap-3 opacity-10 group-hover:opacity-30 transition-all duration-500">
           <div className="w-8 h-[1px] bg-white/50"></div>
           <span className="text-[8px] uppercase tracking-[6px] font-black text-white whitespace-nowrap font-['Space_Grotesk']">x402 Protocol v2.4</span>
           <div className="w-8 h-[1px] bg-white/50"></div>
        </div>
      </div>
    </div>
  );
}
