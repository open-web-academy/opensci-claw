import { useState } from 'react';
import { IDKitWidget, VerificationLevel, ISuccessResult } from '@worldcoin/idkit';

interface WorldIDVerifyProps {
  appId: string;
  action: string;
  signal: string;
  onSuccess: (proof: ISuccessResult) => void;
  onError?: (err: any) => void;
}

/**
 * WorldIDVerify Component (v2 compliant)
 * Uses @worldcoin/idkit instead of the deprecated MiniKit.verify
 */
export default function WorldIDVerify({ appId, action, signal, onSuccess, onError }: WorldIDVerifyProps) {
  const [verifying, setVerifying] = useState(false);

  // If the appId is the placeholder, don't show the widget
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
      <h3 style={{ marginBottom: 8 }}>World ID Verification</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
        Verify your identity to publish research on Mainnet.
      </p>

      <IDKitWidget
        app_id={appId as `app_${string}`}
        action={action}
        signal={signal}
        verification_level={VerificationLevel.Orb}
        onSuccess={(proof) => {
          console.log('IDKit Verification Success:', proof);
          onSuccess(proof);
        }}
        handleVerify={(proof) => {
          console.log('IDKit proof received:', proof);
        }}
      >
        {({ open }) => (
          <button 
            className="btn-primary" 
            onClick={() => {
              setVerifying(true);
              open();
            }}
            style={{ width: '100%', padding: '14px' }}
          >
            {verifying ? 'Verifying...' : 'Verify with World ID'}
          </button>
        )}
      </IDKitWidget>
    </div>
  );
}
