'use client';

import { useState } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';

interface WorldIDVerifyProps {
  appId: string;
  action: string;
  signal: string;
  onSuccess: (result: any) => void;
  onError?: (err: any) => void;
}

export default function WorldIDVerify({ appId, action, signal, onSuccess, onError }: WorldIDVerifyProps) {
  const [status, setStatus] = useState<'idle' | 'fetching_signature' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleStartVerification = async () => {
    setStatus('fetching_signature');
    setErrorMsg(null);

    try {
      if (!MiniKit.isInstalled()) {
        throw new Error('MiniKit no está instalado');
      }

      const response = await (MiniKit.commands as any).verify({
        action: action,
        signal: signal,
        verification_level: "device",
      });

      if (response.finalPayload.status === 'error') {
        throw new Error('Fallo en la verificación nativa');
      }

      onSuccess(response.finalPayload);
      setStatus('success');
    } catch (err: any) {
      console.error('[WorldID] Fallo:', err);
      setStatus('error');
      setErrorMsg(err.message || 'Error desconocido');
      onError?.(err);
    }
  };

  return (
    <div className="mt-6">
      {/* UI Premium SciGate */}
      <div className="p-8 text-center bg-white/5 border border-white/10 rounded-[32px] backdrop-blur-xl relative transition-all hover:bg-white/[0.08] shadow-2xl">
        
        {/* Loading Overlay */}
        {status === 'fetching_signature' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-[32px] z-20 backdrop-blur-sm">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4"></div>
              <p className="text-white font-bold text-xs uppercase tracking-widest">Verificando...</p>
            </div>
          </div>
        )}

        <div className="mb-6 flex justify-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl shadow-2xl transition-all duration-500 ${
            status === 'success' ? 'bg-green-500 shadow-green-500/30 scale-110' : 
            status === 'error' ? 'bg-red-500 shadow-red-500/30' : 
            'bg-gradient-to-br from-indigo-500 to-purple-600 shadow-indigo-500/20'
          }`}>
            {status === 'success' ? '✓' : status === 'error' ? '!' : '👤'}
          </div>
        </div>

        <h3 className="text-xl font-bold mb-2 tracking-tight text-white">
          {status === 'success' ? 'Identidad Confirmada' : 
           status === 'error' ? 'Fallo en Verificación' : 
           'Prueba de Humanidad'}
        </h3>

        <p className="text-white/50 text-sm mb-8 px-4 leading-relaxed max-w-xs mx-auto">
          {status === 'success' ? 'Identidad verificada nivel Device en World Chain.' :
           status === 'error' ? errorMsg : 
           'Para publicar investigación original, debes demostrar que eres humano usando tu World ID.'}
        </p>

        {status !== 'success' && (
          <button
            onClick={handleStartVerification}
            disabled={status === 'fetching_signature'}
            className="w-full py-4 px-6 h-14 bg-white text-black font-black rounded-2xl transition-all transform active:scale-95 shadow-xl flex items-center justify-center gap-3 hover:bg-gray-100 disabled:opacity-50"
          >
            {status === 'fetching_signature' ? 'Segurizando...' : 'Verificar con World ID'}
            <img src="https://worldcoin.org/icons/logo-black.svg" alt="W" className="w-5 h-5" />
          </button>
        )}

        {status === 'success' && (
          <div className="py-2 px-4 bg-green-500/20 border border-green-500/30 rounded-xl text-green-400 text-xs font-bold animate-pulse inline-block">
            CONEXIÓN NATIVA ESTABLECIDA
          </div>
        )}

        <div className="mt-8 flex items-center justify-center gap-2 opacity-30">
          <span className="text-[9px] uppercase tracking-[4px] font-black">Powered by MiniKit Native</span>
        </div>
      </div>
    </div>
  );
}
