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

/**
 * WorldIDVerify (Opción B: Wallet Auth Nativo)
 * Utiliza el comando nativo de MiniKit para autenticar al usuario.
 * No abre pestañas externas y es 100% compatible con World App Bridge.
 */
export default function WorldIDVerify({ appId, action, signal, onSuccess, onError }: WorldIDVerifyProps) {
  const [status, setStatus] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleWalletAuth = async () => {
    try {
      if (!MiniKit.isInstalled()) {
        throw new Error('MiniKit no está instalado o no se detectó World App');
      }

      setStatus('waiting');
      setErrorMsg(null);

      // 1. Generar un nonce aleatorio (requerido por SIWE)
      // En producción esto debería venir del backend, pero para hackathon lo hacemos local.
      const nonce = crypto.randomUUID();
      
      console.log('[WalletAuth] Iniciando firma nativa...', { nonce });

      // 2. Ejecutar comando nativo de MiniKit
      // Esto abre el modal nativo de World App (firma de mensaje) sin abrir pestañas.
      const { finalPayload } = await (MiniKit.commands as any).walletAuth({
        nonce,
        requestId: '0', // Opcional, pero bueno para tracking
        statement: 'Verificando mi identidad como investigador en SciGate.',
      });

      if (finalPayload.status === 'error') {
        throw new Error(finalPayload.error_code || 'Fallo en la autenticación de wallet');
      }

      console.log('[WalletAuth] Éxito:', finalPayload);
      
      setStatus('success');
      
      // Enviamos el resultado al padre (upload/page.tsx)
      // Estructuramos el resultado para que sea compatible con lo que espera el backend
      onSuccess({
        success: true,
        type: 'wallet_auth',
        payload: finalPayload,
        address: finalPayload.address
      });

    } catch (err: any) {
      console.error('[WalletAuth] Error Crítico:', err);
      setStatus('error');
      setErrorMsg(err.message || 'Error desconocido al autenticar');
      onError?.(err);
    }
  };

  return (
    <div className="mt-6">
      <div className="p-8 text-center bg-white/5 border border-white/10 rounded-[32px] backdrop-blur-xl relative transition-all hover:bg-white/[0.08] shadow-2xl">
        {/* Indicador de estado superior */}
        <div className="absolute top-0 left-0 w-full h-1 overflow-hidden rounded-t-[32px]">
          <div className={`h-full transition-all duration-1000 ${
            status === 'waiting' ? 'bg-cyan-500 animate-pulse w-full' : 
            status === 'success' ? 'bg-green-500 w-full' : 
            status === 'error' ? 'bg-red-500 w-full' : 'bg-transparent w-0'
          }`} />
        </div>

        <div className="mb-6 flex justify-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl shadow-2xl transition-all duration-500 ${
            status === 'success' ? 'bg-green-500 shadow-green-500/30 scale-110' : 
            status === 'error' ? 'bg-red-500 shadow-red-500/30' : 
            status === 'waiting' ? 'bg-cyan-400 animate-pulse text-black' :
            'bg-[#00c8ff] shadow-cyan-500/20'
          }`}>
            {status === 'success' ? '✓' : status === 'error' ? '!' : status === 'waiting' ? '⌛' : '🛡️'}
          </div>
        </div>

        <h3 className="text-xl font-bold mb-2 tracking-tight text-white">
          {status === 'success' ? 'Identidad Confirmada' : 
           status === 'error' ? 'Autenticación Fallida' : 
           status === 'waiting' ? 'Firmando en World App...' :
           'Firma de Autor'}
        </h3>

        <p className="text-white/50 text-sm mb-8 px-4 leading-relaxed max-w-xs mx-auto">
          {status === 'success' ? 'Tu wallet ha sido verificada correctamente.' :
           status === 'error' ? errorMsg : 
           status === 'waiting' ? 'Por favor, confirma la solicitud de firma en tu World App.' :
           'Verifica tu autoría publicando una prueba criptográfica desde tu wallet.'}
        </p>

        {status !== 'success' && (
          <button
            onClick={handleWalletAuth}
            disabled={status === 'waiting'}
            className={`w-full py-4 px-6 h-14 font-bold rounded-2xl transition-all transform active:scale-95 shadow-xl flex items-center justify-center gap-3 ${
              status === 'waiting' 
                ? 'bg-white/10 text-white/30 cursor-not-allowed' 
                : 'bg-gradient-to-r from-[#00c8ff] to-[#0072ff] text-white hover:brightness-110'
            }`}
          >
            {status === 'waiting' ? 'Esperando World App...' : 'Verificar con World App'}
            {status !== 'waiting' && (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            )}
          </button>
        )}

        {status === 'success' && (
          <div className="py-2 px-4 bg-green-500/20 border border-green-500/30 rounded-xl text-green-400 text-xs font-bold animate-pulse inline-block">
            SISTEMA LISTO PARA PUBLICAR
          </div>
        )}

        <div className="mt-8 flex items-center justify-center gap-2 opacity-20 hover:opacity-100 transition-opacity duration-500 cursor-default">
          <span className="text-[9px] uppercase tracking-[4px] font-black text-white">NATIVE AUTH v2</span>
        </div>
      </div>
    </div>
  );
}
