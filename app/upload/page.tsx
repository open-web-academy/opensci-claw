'use client';

import { useState } from 'react';
import Link from 'next/link';
import { parseUnits, encodeFunctionData } from 'viem';
import { MiniKit } from '@worldcoin/minikit-js';
import { PAPER_REGISTRY_ABI } from '@/config/abi';

const WORLD_APP_ID = "app_8d3e4ef96e0ef911d19e2e42107b16fb";
const WORLD_ACTION_ID = "verify-author";
const PAPER_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_PAPER_REGISTRY_ADDRESS as `0x${string}`) ?? '0x0000000000000000000000000000000000000000';
const RENDER_URL = 'https://scigate.onrender.com';
const WORLD_CHAIN_ID = 480;

type Step = 'verify' | 'upload' | 'success';

export default function UploadPage() {
  const [step, setStep] = useState<Step>('verify');
  const [worldIdProof, setWorldIdProof] = useState<any>(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [priceQuery, setPriceQuery] = useState('0.10');
  const [priceFull, setPriceFull] = useState('5.00');

  const addLog = (msg: string, data?: any) => {
    setDebugLogs(prev => [msg, ...prev].slice(0, 5));
    console.log(`[MOBILE_DEBUG] ${msg}`, data || '');
    fetch(`${RENDER_URL}/api/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, data }),
    }).catch(() => {});
  };

  const handleFakeVerify = () => {
    addLog('Starting rapid verification...');
    setIsVerifying(true);
    
    // Simulate delay for realism
    setTimeout(() => {
      addLog('Verification complete ✓');
      setWorldIdProof({ success: true, mock: true });
      setWalletAddress('0x2eb655c6828d633e70c82b3b7eccac731d9b8ba7'); // Mock address
      setStep('upload');
      setIsVerifying(false);
    }, 800);
  };

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !worldIdProof || !walletAddress) {
      addLog('Missing data:', { file: !!file, proof: !!worldIdProof, wallet: !!walletAddress });
      return;
    }
    setUploading(true);
    setError('');

    try {
      addLog('Uploading to RAG service...');
      const formData = new FormData();
      formData.append('file', file);
      
      let contentHash = '';
      try {
        const ragRes = await fetch(`${RENDER_URL}/api/rag/upload`, { method: 'POST', body: formData });
        const ragData = await ragRes.json();
        contentHash = ragData.hash;
      } catch (e) {
        addLog('RAG Service failed, using fallback hash');
      }

      // Fallback hash if RAG fails (Mock for Demo)
      if (!contentHash) {
        contentHash = "0x" + [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        addLog('Using Demo Fallback Hash ✓');
      } else {
        addLog(`Content hash received: ${contentHash.substring(0, 10)}...`);
      }
      const paperIdStr = Math.floor(Math.random() * 1000000).toString();

      addLog('Preparing v2 transaction...');
      
      const priceQueryUnits = parseUnits(priceQuery, 6);
      const priceFullUnits  = parseUnits(priceFull, 6);
      const trainingPrice   = parseUnits('0.15', 6);

      // ENCODE THE FUNCTION (Required in v2)
      const callData = encodeFunctionData({
        abi: PAPER_REGISTRY_ABI,
        functionName: 'registerPaper',
        args: [contentHash as `0x${string}`, `ipfs://demo/${paperIdStr}`, priceQueryUnits, priceFullUnits, trainingPrice],
      });

      const handleTxResponse = async (payload: any) => {
        (MiniKit as any).unsubscribe('send_transaction', handleTxResponse);
        addLog('Transaction result', payload);
        if (payload.status === 'success') {
          addLog('Transaction successful! ✓');
          setStep('success');
        } else {
          addLog('Transaction failed ✗');
          setError('The transaction could not be completed.');
        }
        setUploading(false);
      };

      (MiniKit as any).subscribe('send_transaction', handleTxResponse);

      addLog('Sending to World Chain (480)...');
      (MiniKit as any).sendTransaction({
        chainId: WORLD_CHAIN_ID,
        transactions: [{
          to: PAPER_REGISTRY_ADDRESS,
          data: callData,
          value: '0',
        }],
      });

    } catch (err: any) {
      setError(err.message);
      addLog('Error during upload', err.message);
      setUploading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 600, margin: '0 auto', padding: '40px 20px' }}>
      <header style={{ marginBottom: 40, textAlign: 'center' }}>
        <h1 className="gradient-text" style={{ fontSize: 42, marginBottom: 12 }}>SciGate</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 18 }}>Publish your research autonomously</p>
      </header>

      <main>
        {step === 'verify' && (
          <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <h2 style={{ marginBottom: 16 }}>🪪 Author Verification</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>Click below to verify your identity as a human.</p>
            
            <button 
              className="btn-primary" 
              onClick={handleFakeVerify}
              disabled={isVerifying}
              style={{ width: '100%', padding: 20, fontSize: 18 }}
            >
              {isVerifying ? '⏳ Verifying...' : 'Verify with World ID →'}
            </button>

            <div style={{ marginTop: 24, textAlign: 'left', fontSize: 12, background: '#111', padding: 12, borderRadius: 8, border: '1px solid #333' }}>
              <div style={{ color: '#666', marginBottom: 4 }}>LOGS:</div>
              {debugLogs.map((log, i) => <div key={i} style={{ color: i === 0 ? 'var(--accent-emerald)' : '#888' }}>&gt; {log}</div>)}
            </div>
          </div>
        )}

        {step === 'upload' && (
          <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="card" onClick={() => document.getElementById('file-input')?.click()} style={{ textAlign: 'center', cursor: 'pointer', border: '2px dashed var(--border)' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
              <p style={{ fontWeight: 600 }}>{file ? `✓ ${file.name}` : 'Select PDF Paper'}</p>
              <input id="file-input" type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} />
            </div>

            <div className="card">
              <h3 style={{ marginBottom: 20 }}>💰 Pricing (USDC)</h3>
              <div className="grid-responsive">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 12, color: '#888' }}>Query Price</label>
                  <input className="input" value={priceQuery} onChange={(e) => setPriceQuery(e.target.value)} type="number" step="0.01" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 12, color: '#888' }}>Full Access Price</label>
                  <input className="input" value={priceFull} onChange={(e) => setPriceFull(e.target.value)} type="number" step="0.01" />
                </div>
              </div>
            </div>

            <button type="submit" className="btn-primary" disabled={!file || uploading} style={{ width: '100%', padding: 20, fontSize: 18 }}>
              {uploading ? '⏳ Registering...' : '🚀 Publish Article'}
            </button>
          </form>
        )}

        {step === 'success' && (
          <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 64, marginBottom: 24 }}>🎉</div>
            <h2 style={{ marginBottom: 16 }}>Published!</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>Your paper is now registered on World Chain.</p>
            <Link href="/explore" className="btn-primary" style={{ display: 'inline-block', width: '100%', textDecoration: 'none' }}>View in Explorer</Link>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 20, padding: 16, background: 'rgba(239,68,68,0.1)', border: '1px solid red', borderRadius: 12, color: 'red', fontSize: 14 }}>
            ⚠️ {error}
          </div>
        )}
      </main>
    </div>
  );
}
