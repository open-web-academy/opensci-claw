import { useState, useCallback } from 'react';
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

  // Fetch the required server-side signature (RP Context) for World ID 4.0
  const prepareVerification = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      console.log('Fetching World ID 4.0 RP Signature...');
      const response = await fetch('/api/auth/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, signal })
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Failed to sign request');

      setRpContext(data.rp_context);
      // Open the widget now that we have the context
      setIsOpen(true);
    } catch (err: any) {
      console.error('IDKit Prepare Error:', err);
      setError(err.message || 'Error initializing verification');
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }, [action, signal, loading, onError]);

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
      <div style={{ fontSize: 32, marginBottom: 16 }}>🛡️</div>
      <h3 style={{ marginBottom: 8 }}>World ID Identity</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
        Securely verify your humanity via the official World ID modal.
      </p>

      {error && (
        <p style={{ color: '#f87171', fontSize: 12, marginBottom: 16 }}>⚠️ {error}</p>
      )}

      <button 
        className="btn-primary" 
        onClick={prepareVerification}
        style={{ width: '100%', padding: '14px' }}
        disabled={loading}
      >
        {loading ? '⏳ Initializing...' : 'Verify Humanity Now →'}
      </button>

      <IDKitRequestWidget
        app_id={appId as `app_${string}`}
        action={action}
        open={isOpen}
        onOpenChange={setIsOpen}
        // rp_context is required for v4
        rp_context={rpContext}
        // Mandatory in v4: allows compatibility with older World ID versions
        allow_legacy_proofs={true}
        // preset provides legacy compatibility and signal
        preset={orbLegacy({ signal: signal.toLowerCase() })}
        onSuccess={(result) => {
          console.log('IDKit Verification Success:', result);
          onSuccess(result);
        }}
        onError={(err) => {
          console.error('IDKit Modal Error:', err);
          setError('Modal closed or failed initialization');
        }}
      />
    </div>
  );
}
