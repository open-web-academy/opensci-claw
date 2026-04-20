import { useState, useEffect, useRef } from 'react';
import { IDKit, CredentialRequest, IDKitCompletionResult } from '@worldcoin/idkit-core';
import { MiniKit, VerificationLevel as MiniKitVerificationLevel } from '@worldcoin/minikit-js';

interface WorldIDVerifyProps {
  appId: string;
  action: string;
  signal: string;
  onSuccess: (result: any) => void;
  onError?: (err: any) => void;
}

/**
 * WorldIDVerify (Hybrid MiniKit + IDKit)
 * Priority order:
 * 1. MiniKit.verify (Native modal - smoothest for Mainnet)
 * 2. IDKit Core (Functional bridge - fallback for simulator/web)
 */
export default function WorldIDVerify({ appId, action, signal, onSuccess, onError }: WorldIDVerifyProps) {
  const [status, setStatus] = useState<'initializing' | 'waiting' | 'success' | 'error'>('initializing');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const triggerRef = useRef(false);

  useEffect(() => {
    if (triggerRef.current || !appId || appId === 'app_staging_placeholder') return;
    triggerRef.current = true;

    async function startVerification() {
      try {
        // 1. Detect Environment based on App ID prefix
        const isProduction = appId.startsWith('app_') && !appId.startsWith('app_staging_');
        const env = isProduction ? 'production' : 'staging';
        
        console.log(`[WorldID] Initialization (${env}) for Action: ${action}`);
        setStatus('waiting');

        // 2. PRIMARY: Use MiniKit if installed (Best for Mainnet/World App)
        if (MiniKit.isInstalled()) {
          console.log('[WorldID] Using MiniKit Native Verify...');
          const result = await MiniKit.commands.verify({
            action: action.trim(),
            signal: signal.trim(),
            verification_level: isProduction ? MiniKitVerificationLevel.Orb : MiniKitVerificationLevel.Device,
          });

          if (result.finalPayload.status === 'error') {
            throw new Error(result.finalPayload.details || 'Native verification failed');
          }

          console.log('[WorldID] MiniKit Success!');
          setStatus('success');
          onSuccess(result.finalPayload);
          return;
        }

        // 3. FALLBACK: Use IDKit Core (Good for Simulator/External Browser)
        console.log('[WorldID] MiniKit not found, falling back to IDKit Core Bridge...');
        
        const builder = IDKit.request({
          app_id: appId as `app_${string}`,
          action: action.trim(),
          signal: signal.trim(),
          environment: env,
          verification_level: isProduction ? 'orb' : 'device',
        });

        const request = await builder.request();
        const completion: IDKitCompletionResult = await request.pollUntilCompletion();

        if (completion.success) {
          console.log('[WorldID] IDKit Success!');
          setStatus('success');
          onSuccess(completion.result);
        } else {
          throw new Error(completion.error || 'Bridge verification failed');
        }
      } catch (err: any) {
        console.error('[WorldID] Generic Error:', err);
        setErrorMsg(err.message || 'Unknown error');
        setStatus('error');
        onError?.(err);
      }
    }

    startVerification();
  }, [appId, action, signal, onSuccess, onError]);

  if (!appId || appId === 'app_staging_placeholder') {
    return <div style={{ padding: 20 }}>⚠️ Configuration Error: App ID missing</div>;
  }

  return (
    <div style={{ 
      padding: '32px', 
      textAlign: 'center', 
      background: 'rgba(255,255,255,0.03)', 
      borderRadius: '24px',
      border: '1px solid var(--border)',
      marginTop: 24,
      backdropFilter: 'blur(20px)'
    }}>
      <div className={status === 'waiting' ? 'animate-pulse' : ''} style={{ fontSize: 48, marginBottom: 20 }}>
        {status === 'success' ? '✅' : status === 'error' ? '❌' : '🛡️'}
      </div>
      <h3 style={{ marginBottom: 12, fontSize: 20, fontWeight: 700 }}>
        {status === 'waiting' ? 'Verificando Identidad' : 
         status === 'error' ? 'Verificación Fallida' : 
         status === 'success' ? 'Identidad Verificada' : 'Preparando...'}
      </h3>
      
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
        {status === 'waiting' ? 'Confirma la solicitud en tu World App para continuar.' :
         status === 'error' ? `Error: ${errorMsg}` : 
         status === 'success' ? 'Has sido verificado como humano único.' : 'Inicializando puente seguro...'}
      </p>

      {status === 'error' && (
        <button 
          className="btn-primary" 
          onClick={() => { triggerRef.current = false; window.location.reload(); }}
          style={{ marginTop: 20, width: '100%' }}
        >
          Reintentar ahora
        </button>
      )}

      {status === 'waiting' && (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="spinner" style={{ borderTopColor: 'var(--accent-indigo)' }}></div>
          <span style={{ fontSize: 10, marginTop: 12, letterSpacing: '2px', opacity: 0.5 }}>
            {MiniKit.isInstalled() ? 'WAITING FOR NATIVE MODAL' : 'CONNECTING TO BRIDGE'}
          </span>
        </div>
      )}
    </div>
  );
}
