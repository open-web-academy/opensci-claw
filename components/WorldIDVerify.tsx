'use client';

import { useState, useEffect } from 'react';
import { IDKitWidget, ISuccessResult } from '@worldcoin/idkit';

interface WorldIDVerifyProps {
  appId: string;
  action: string;
  signal: string;
  onSuccess: (result: ISuccessResult) => void;
  onError?: (err: any) => void;
}

/**
 * WorldIDVerify (IDKit UI v1.3.0)
 * Utiliza el widget oficial que maneja automáticamente el bridge y la UI.
 * Evita el error de 'rp_context' requerido en SDK v4.
 */
export default function WorldIDVerify({ appId, action, signal, onSuccess, onError }: WorldIDVerifyProps) {
  const [status, setStatus] = useState<'initializing' | 'waiting' | 'success' | 'error'>('initializing');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Determinar entorno para logs (aunque el Widget lo maneja internamente)
  const isProduction = appId.startsWith('app_') && !appId.startsWith('app_staging_');
  
  useEffect(() => {
    if (appId && appId !== 'app_staging_placeholder') {
      setStatus('waiting');
    }
  }, [appId]);

  const handleSuccess = (result: ISuccessResult) => {
    console.log('[WorldID] Verificación exitosa:', result);
    setStatus('success');
    onSuccess(result);
  };

  const handleError = (error: any) => {
    console.error('[WorldID] Error en el widget:', error);
    setErrorMsg(error.message || 'Error en la verificación');
    setStatus('error');
    onError?.(error);
  };

  if (!appId || appId === 'app_staging_placeholder') {
    return (
      <div className="p-6 bg-red-500/10 border border-red-500/50 rounded-2xl text-center">
        <p className="text-red-400 font-bold">⚠️ App ID inválido</p>
        <p className="text-xs opacity-70">Verifica tu archivo .env (WORLD_APP_ID)</p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <IDKitWidget
        app_id={appId as `app_${string}`}
        action={action}
        signal={signal}
        onSuccess={handleSuccess}
        handleVerify={async (proof: ISuccessResult) => {
          // Esta función se puede usar para validación adicional antes de cerrar el modal
          console.log('[WorldID] Proof recibida, validando...', proof);
        }}
        onError={handleError}
        // Soporte para Mainnet (Orb) vs Staging (Device)
        credential_types={isProduction ? ['orb'] : ['device']}
        autoClose
      >
        {({ open }: { open: () => void }) => (
          <div 
            className="p-8 text-center bg-white/5 border border-white/10 rounded-[32px] backdrop-blur-xl relative overflow-hidden"
          >
            {/* Efecto de fondo sutil */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50" />
            
            <div className="mb-6 flex justify-center">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl shadow-2xl transition-all duration-500 ${
                status === 'success' ? 'bg-green-500 shadow-green-500/20 scale-110' : 
                status === 'error' ? 'bg-red-500 shadow-red-500/20' : 
                'bg-cyan-500 shadow-cyan-500/20'
              }`}>
                {status === 'success' ? '✓' : status === 'error' ? '!' : '🛡️'}
              </div>
            </div>

            <h3 className="text-xl font-bold mb-2 tracking-tight">
              {status === 'success' ? '¡Identidad Verificada!' : 
               status === 'error' ? 'Error de Identidad' : 
               'Verificación de Autor'}
            </h3>

            <p className="text-white/60 text-sm mb-8 px-4 leading-relaxed">
              {status === 'success' ? 'Has sido confirmado como humano único.' :
               status === 'error' ? errorMsg : 
               'Conecta tu World ID para poder publicar tu paper de forma oficial en la red.'}
            </p>

            {status !== 'success' && (
              <button
                onClick={open}
                className="w-full py-4 px-6 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-2xl transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-cyan-900/40 border border-white/10 flex items-center justify-center gap-3"
              >
                {status === 'error' ? 'Reintentar Verificación' : 'Verificar con World ID'}
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </button>
            )}

            {status === 'success' && (
              <div className="py-4 px-6 bg-green-500/10 border border-green-500/20 rounded-2xl text-green-400 text-sm font-medium animate-bounce">
                Redirigiendo a la subida...
              </div>
            )}

            <div className="mt-6 flex items-center justify-center gap-2 opacity-30 grayscale hover:grayscale-0 transition-all">
              <span className="text-[10px] uppercase tracking-[3px] font-bold">Powered by</span>
              <img src="https://worldcoin.org/icons/logo-white.svg" alt="Worldcoin" className="h-3" />
            </div>
          </div>
        )}
      </IDKitWidget>
    </div>
  );
}
