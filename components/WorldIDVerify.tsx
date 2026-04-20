'use client';

import { useState, useEffect, useRef } from 'react';
import { IDKit, IDKitCompletionResult } from '@worldcoin/idkit-core';

interface WorldIDVerifyProps {
  appId: string;
  action: string;
  signal: string;
  onSuccess: (result: any) => void;
  onError?: (err: any) => void;
}

/**
 * WorldIDVerify (Headless Core v4)
 * Estructura actualizada para cumplir con IDKitRequestConfig v4.1.1
 * Mueve el 'signal' a los constraints y maneja el patrón Builder.
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
        const isProduction = appId.startsWith('app_') && !appId.startsWith('app_staging_');
        const env = (isProduction ? 'production' : 'staging') as 'production' | 'staging';
        
        console.log(`[WorldID] Configurando v4 (${env}) - Action: ${action}`);
        setStatus('waiting');

        // 1. Crear el builder (IDKit v4 requiere rp_context para ser estricto, 
        // pero usamos un bypass para hackathon si no hay backend de firmas)
        const builder = IDKit.request({
          app_id: appId as `app_${string}`,
          action: action.trim(),
          environment: env,
          allow_legacy_proofs: true
        } as any);

        // 2. Configurar el signal y nivel de verificación vía Constraints
        // 'proof_of_human' equivale al nivel Orb (requerido para producción)
        const request = await builder.constraints(
          IDKit.CredentialRequest('proof_of_human', { 
            signal: signal.trim() 
          })
        );

        console.log('[WorldID] Bridge listo, esperando confirmación...');
        const completion: IDKitCompletionResult = await request.pollUntilCompletion();

        if (completion.success) {
          console.log('[WorldID] Éxito absoluto');
          setStatus('success');
          onSuccess(completion.result);
        } else {
          throw new Error(completion.error || 'Verificación cancelada');
        }
      } catch (err: any) {
        console.error('[WorldID] Fallo crítico:', err);
        setErrorMsg(err.message || 'Error de conexión');
        setStatus('error');
        onError?.(err);
      }
    }

    startVerification();
  }, [appId, action, signal, onSuccess, onError]);

  if (!appId || appId === 'app_staging_placeholder') {
    return <div style={{ padding: 20 }}>⚠️ Configuración: ID de App no encontrado o inválido</div>;
  }

  return (
    <div style={{ 
      padding: '32px', 
      textAlign: 'center', 
      background: 'rgba(255,255,255,0.02)', 
      borderRadius: '24px',
      border: '1px solid rgba(255,255,255,0.1)',
      marginTop: 24,
      backdropFilter: 'blur(20px)'
    }}>
      <div className={status === 'waiting' ? 'animate-pulse' : ''} style={{ fontSize: 48, marginBottom: 20 }}>
        {status === 'success' ? '✅' : status === 'error' ? '❌' : '🛡️'}
      </div>
      <h3 style={{ marginBottom: 12, fontSize: 20, fontWeight: 700 }}>
        {status === 'waiting' ? 'Autenticando con World ID' : 
         status === 'error' ? 'Error de Identidad' : 
         status === 'success' ? 'Humano Verificado' : 'Preparando...'}
      </h3>
      
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
        {status === 'waiting' ? 'Verifica la solicitud en tu World App.' :
         status === 'error' ? `Detalle: ${errorMsg}` : 
         status === 'success' ? 'Identidad confirmada para este registro.' : 'Conectando con el oráculo de identidad...'}
      </p>

      {status === 'error' && (
        <button 
          className="btn-primary" 
          onClick={() => { triggerRef.current = false; window.location.reload(); }}
          style={{ marginTop: 20, width: '100%', padding: '12px', borderRadius: '12px' }}
        >
          Intentar de nuevo
        </button>
      )}

      {status === 'waiting' && (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="spinner" style={{ borderTopColor: '#00c8ff' }}></div>
          <span style={{ fontSize: 10, marginTop: 12, letterSpacing: '2px', opacity: 0.5 }}>
            POLLING WORLD APP
          </span>
        </div>
      )}
    </div>
  );
}
