import { useState, useEffect, useRef } from 'react';
import { IDKit, orbLegacy, IDKitCompletionResult } from '@worldcoin/idkit-core';

interface WorldIDVerifyProps {
  appId: string;
  action: string;
  signal: string;
  onSuccess: (result: any) => void;
  onError?: (err: any) => void;
}

/**
 * WorldIDVerify (Headless Core v4)
 * Uses the pure functional API to avoid UI rendering crashes (React 19 / WebView).
 * This method is the MOST stable for World App Mini Apps.
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
        const cleanAppId = appId.trim();
        console.log('[Headless] Starting verification for:', cleanAppId);
        setStatus('waiting');

        // REAL RP ID FROM PORTAL SCREENSHOT
        const rpId = 'rp_e2b239675f4bd84b';

        console.log('[Headless] Using PORTAL RP_ID:', rpId);

        // Mock context for hackathon fallback
        const now = Math.floor(Date.now() / 1000);
        const mockRpContext = {
          rp_id: rpId as `rp_${string}`,
          nonce: Math.random().toString(36).substring(7),
          created_at: now,
          expires_at: now + 3600,
          signature: '0x' + '0'.repeat(130) // Standard 65-byte zero signature
        };

        const builder = IDKit.request({
          app_id: cleanAppId as `app_${string}`,
          action: action.trim(),
          rp_context: mockRpContext,
          allow_legacy_proofs: true,
          environment: 'staging' // Force staging to relax bridge validations
        });

        // Use OrbLegacy for maximum compatibility with current World App bridge
        const request = await builder.preset(orbLegacy({ signal }));

        console.log('[Headless] Modal triggered, waiting for completion...');
        
        const completion: IDKitCompletionResult = await request.pollUntilCompletion();

        if (completion.success) {
          console.log('[Headless] SUCCESS!', completion.result);
          setStatus('success');
          onSuccess(completion.result);
        } else {
          throw new Error(completion.error || 'Verification failed');
        }
      } catch (err: any) {
        console.error('[Headless] Error:', err);
        setErrorMsg(err.message || 'Unknown error');
        setStatus('error');
        onError?.(err);
      }
    }

    startVerification();
  }, [appId, action, signal, onSuccess, onError]);

  if (!appId || appId === 'app_staging_placeholder') {
    return <div style={{ padding: 20 }}>⚠️ Configuration Error</div>;
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
      <div className="animate-pulse" style={{ fontSize: 48, marginBottom: 20 }}>🛡️</div>
      <h3 style={{ marginBottom: 12, fontSize: 20, fontWeight: 700 }}>
        {status === 'waiting' ? 'Verificando Identidad' : 
         status === 'error' ? 'Verificación Fallida' : 'Preparando...'}
      </h3>
      
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
        {status === 'waiting' ? 'Confirma la solicitud en tu World App para continuar.' :
         status === 'error' ? `Error: ${errorMsg}` : 'Inicializando puente seguro...'}
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
          <span style={{ fontSize: 10, marginTop: 12, letterSpacing: '2px', opacity: 0.5 }}>CONNECTING TO BRIDGE</span>
        </div>
      )}
    </div>
  );
}
