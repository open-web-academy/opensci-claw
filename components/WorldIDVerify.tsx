import { useState, useCallback, useEffect, useRef } from 'react';
import { IDKitRequestWidget, orbLegacy, IDKitResult } from '@worldcoin/idkit';

interface WorldIDVerifyProps {
  appId: string;
  action: string;
  signal: string;
  onSuccess: (proof: IDKitResult) => void;
  onError?: (err: any) => void;
}

/**
 * WorldIDVerify (v4 / Real Modal Restoration)
 * Restores the REAL World ID modal using the v4 standard and server-side signatures.
 */
export default function WorldIDVerify({ appId, action, signal, onSuccess, onError }: WorldIDVerifyProps) {
  const [loading, setLoading] = useState(false);
  const [rpContext, setRpContext] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  
  // Guard to prevent multiple simultaneous requests or infinite loops
  const inFlight = useRef(false);

  // Fetch the required server-side signature (RP Context) for World ID 4.0
  const prepareVerification = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    
    setLoading(true);
    setError(null);

    try {
      console.log('Fetching World ID 4.0 RP Signature...');
      const response = await fetch('/api/auth/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, signal })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Failed to sign request');

      setRpContext(data.rp_context);
      setIsOpen(true);
    } catch (err: any) {
      console.error('IDKit Prepare Error:', err);
      setError(err.message || 'Error initializing verification');
      onError?.(err);
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [action, signal, onError]); // Removed loading from dependencies to avoid loop

  // Automatic Trigger on mount
  useEffect(() => {
    const trigger = async () => {
      // Only trigger if we don't have a context yet and are within a valid app environment
      if (!rpContext && !loading && appId !== 'app_staging_placeholder') {
        await prepareVerification();
      }
    };
    trigger();
    // We only want this to run when the component actually mounts or dependencies strictly change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, action, signal]); 

  if (!appId || appId === 'app_staging_placeholder') {
    return (
      <div className="card" style={{ textAlign: 'center', opacity: 0.6 }}>
        <p>⚠️ Configuration missing: NEXT_PUBLIC_WORLD_APP_ID</p>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '24px', 
      textAlign: 'center', 
      background: 'rgba(255,255,255,0.03)', 
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)',
      marginTop: 24 
    }}>
      <div className="animate-pulse" style={{ fontSize: 32, marginBottom: 16 }}>🛡️</div>
      <h3 style={{ marginBottom: 8 }}>Verifying Humanity</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
        Please wait while we securely connect to World ID...
      </p>

      {error && (
        <div style={{ padding: '12px', background: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-sm)', marginBottom: 16 }}>
          <p style={{ color: '#f87171', fontSize: 13, marginBottom: 8 }}>⚠️ {error}</p>
          <button 
            className="btn-primary" 
            onClick={() => {
              setRpContext(null); // Clear context to allow retry
              prepareVerification();
            }} 
            style={{ fontSize: 12, padding: '8px 16px' }}
          >
            Retry Verification
          </button>
        </div>
      )}

      {!error && !isOpen && (
        <div style={{ color: 'var(--accent-indigo)', fontSize: 12, fontWeight: 600 }}>
          ⏳ INITIALIZING MODAL...
        </div>
      )}

      <IDKitRequestWidget
        app_id={appId as `app_${string}`}
        action={action}
        open={isOpen}
        onOpenChange={setIsOpen}
        rp_context={rpContext}
        allow_legacy_proofs={true}
        preset={orbLegacy({ signal: signal.toLowerCase() })}
        onSuccess={(result) => {
          console.log('IDKit Verification Success:', result);
          onSuccess(result);
        }}
        onError={(err) => {
          console.error('IDKit Modal Error:', err);
          if (err !== 'user_rejected' as any) {
             setError('Identity verification closed. Please try again.');
          }
          setIsOpen(false);
          setRpContext(null); // Reset context on error to allow clean retry
        }}
      />
    </div>
  );
}
