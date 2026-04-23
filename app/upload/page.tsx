'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { parseUnits, encodeFunctionData } from 'viem';
import { MiniKit } from '@worldcoin/minikit-js';
import { PAPER_REGISTRY_ABI } from '@/config/abi';

// Dynamic import for WorldIDVerify component (SSR: false)
const WorldIDVerify = dynamic(
  () => import('@/components/WorldIDVerify'),
  { ssr: false, loading: () => <button className="btn-primary" disabled style={{ width: '100%' }}>Loading Verification...</button> }
);

const API_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3001';
const RAG_URL = process.env.NEXT_PUBLIC_RAG_URL ?? 'http://localhost:8000';
const WORLD_APP_ID = process.env.NEXT_PUBLIC_WORLD_APP_ID ?? '';
const WORLD_ACTION_ID = process.env.NEXT_PUBLIC_WORLD_ACTION_ID ?? 'verify-author';
const PAPER_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_PAPER_REGISTRY_ADDRESS ?? '';
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

type Step = 'verify' | 'upload' | 'success';

export default function UploadPage() {
  const [step, setStep] = useState<Step>('verify');
  const [worldIdProof, setWorldIdProof] = useState<any>(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [walletConfirmed, setWalletConfirmed] = useState(false);

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [error, setError] = useState('');

  const [priceQuery, setPriceQuery] = useState('0.01');
  const [priceFull, setPriceFull] = useState('0.10');

  // Auto-detect wallet from MiniKit
  useEffect(() => {
    // Check after a short delay to ensure MiniKit state is fully initialized
    const timer = setTimeout(() => {
      if (MiniKit.user?.walletAddress) {
        console.log('Auto-detected wallet address:', MiniKit.user.walletAddress);
        setWalletAddress(MiniKit.user.walletAddress);
        setWalletConfirmed(true);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type === 'application/pdf') {
      setFile(dropped);
    } else {
      setError('Only PDF files are accepted');
    }
  }, []);

  const handleVerifyWorldId = async (proof: any) => {
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proof, wallet_address: walletAddress }),
    });
    const data = await res.json();
    if (data.success) {
      setWorldIdProof(proof);
      setStep('upload');
    } else {
      setError('World ID verification failed: ' + (data.error ?? 'unknown'));
    }
  }

  const [miniKitNotInstalled, setMiniKitNotInstalled] = useState(false);

  const handleDetectWallet = async () => {
    setError('');
    console.log('Attempting wallet detection...');
    
    if (!MiniKit.isInstalled()) {
      setMiniKitNotInstalled(true);
      setError('MiniKit is not detected. If you are in a desktop browser, please enter your wallet address manually below.');
      return;
    }

    try {
      // 1. Detectar Wallet
      const res = await (MiniKit as any).walletAuth({
        nonce: Math.random().toString(36).substring(2),
        requestId: 'scigate_auth',
        expirationTime: new Date(Date.now() + 1000 * 60 * 60),
      });

      if (res.data?.address) {
        const detectedAddress = res.data.address;
        setWalletAddress(detectedAddress);
        setWalletConfirmed(true);

        // 2. ¡FLUJO DIRECTO! Lanzar verificación de World ID inmediatamente
        console.log('Wallet detected, triggering World ID verification automatically...');
        try {
          const verifyRes = await (MiniKit as any).verify({
            action: WORLD_ACTION_ID,
            signal: detectedAddress.toLowerCase(),
            verification_level: 'device',
          });

          if (verifyRes.finalPayload.status === 'success') {
            console.log('Automatic Verification Success:', verifyRes.finalPayload);
            // Reutilizamos la función que ya maneja el éxito
            handleVerifyWorldId(verifyRes.finalPayload);
          }
        } catch (vErr) {
          console.error('Automatic verification failed, user can still click the button manually:', vErr);
        }
      } else {
        throw new Error('Wallet detection failed or was cancelled.');
      }
    } catch (err: any) {
      console.error('MiniKit Auth Error:', err);
      setError(err.message || 'Could not detect wallet. Please ensure you are inside the World App.');
    }
  };

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !worldIdProof || !walletAddress) return;
    setUploading(true);
    setError('');

    try {
      // 1. Upload PDF to RAG engine
      const formData = new FormData();
      formData.append('file', file);
      const ragRes = await fetch('/api/rag/upload', { method: 'POST', body: formData });
      if (!ragRes.ok) {
        const errData = await ragRes.json().catch(() => ({}));
        throw new Error(`RAG upload failed: ${errData.detail || errData.error || 'Unknown error'}`);
      }
      const ragData = await ragRes.json();
      const paperIdStr = String(ragData.paper_id);
      const contentHash = paperIdStr.startsWith('0x') ? paperIdStr : `0x${paperIdStr}`;

      // 2. Register On-Chain (The "Optimal" Step)
      console.log('Registering paper on World Chain Mainnet...');
      
      const priceQueryUnits = parseUnits(priceQuery, 6);
      const priceFullUnits  = parseUnits(priceFull, 6);
      const trainingPrice   = parseUnits('0.15', 6); // Default training price

      if (!MiniKit.isInstalled()) {
        throw new Error('MiniKit is not installed. On-chain registration requires the World App.');
      }

      if (!PAPER_REGISTRY_ADDRESS || !/^0x[0-9a-fA-F]{40}$/.test(PAPER_REGISTRY_ADDRESS)) {
        throw new Error(
          'PaperRegistry contract address not configured. Set NEXT_PUBLIC_PAPER_REGISTRY_ADDRESS to a deployed contract.'
        );
      }

      const calldata = encodeFunctionData({
        abi: PAPER_REGISTRY_ABI,
        functionName: 'registerPaper',
        args: [
          contentHash as `0x${string}`,
          `ipfs://placeholder/${paperIdStr}`,
          priceQueryUnits,
          priceFullUnits,
          trainingPrice,
        ],
      });

      const response = await MiniKit.sendTransaction({
        transactions: [
          {
            to: PAPER_REGISTRY_ADDRESS as `0x${string}`,
            data: calldata,
            value: '0',
          },
        ],
        chainId: 480,
      });

      const txId = (response as any).data?.transactionId || (response as any).data?.transactionHash;

      if (!txId) {
        throw new Error('On-chain registration was cancelled or failed.');
      }

      // 3. Register author with World ID proof and pricing in Hono server
      const registerRes = await fetch('/api/authors/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          wallet_address: walletAddress, 
          world_id_proof: worldIdProof,
          paper_hash: contentHash,
          price_query: priceQuery,
          price_full: priceFull,
          transaction_id: txId
        }),
      });

      if (!registerRes.ok) {
        const errData = await registerRes.json().catch(() => ({}));
        throw new Error(`Local registration failed: ${errData.error || 'Server connection failed'}`);
      }

      setUploadResult({
        ...ragData,
        walletAddress,
        priceQuery,
        priceFull,
        txHash: txId
      });
      setStep('success');
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Something went wrong');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <nav>
        <div className="nav-inner">
          <Link href="/" className="nav-logo">⬡ SciGate</Link>
          <ul className="nav-links">
            <li><Link href="/explore">Explore</Link></li>
            <li><Link href="/upload" style={{ color: 'var(--text-primary)' }}>Publish</Link></li>
            <li><Link href="/dashboard">Dashboard</Link></li>
          </ul>
        </div>
      </nav>

      <main style={{ paddingTop: 100, minHeight: '100vh', paddingBottom: 80 }}>
        <div className="container" style={{ maxWidth: 700 }}>
          <div style={{ marginBottom: 48 }}>
            <h1 style={{ fontSize: 'clamp(32px, 4vw, 48px)', marginBottom: 12 }}>
              Publish Your <span className="gradient-text">Research</span>
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 17 }}>
              Upload and register on World Chain Mainnet.
            </p>
          </div>

          {error && (
            <div style={{ padding: '14px 20px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', color: '#f87171', marginBottom: 24, fontSize: 14 }}>
              ⚠️ {error}
            </div>
          )}

          {/* Step 1: World ID Verification */}
          {step === 'verify' && (
            <div className="card">
              <h2 style={{ fontSize: 24, marginBottom: 8 }}>🪪 Author Verification</h2>
              
              {!walletConfirmed ? (
                miniKitNotInstalled && DEMO_MODE ? (
                  <div style={{ margin: '32px 0' }}>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
                      ⚠️ Demo mode — manual wallet entry:
                    </p>
                    <input
                      className="input"
                      value={walletAddress}
                      onChange={(e) => setWalletAddress(e.target.value)}
                      placeholder="Your Wallet Address (0x...)"
                      style={{ marginBottom: 16, width: '100%' }}
                    />
                    <button
                      className="btn-primary"
                      onClick={() => setWalletConfirmed(true)}
                      disabled={!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)}
                      style={{ width: '100%', padding: '16px' }}
                    >
                      Confirm Wallet →
                    </button>
                  </div>
                ) : miniKitNotInstalled ? (
                  <div style={{ margin: '32px 0', padding: 20, background: 'rgba(239,68,68,0.08)', borderRadius: 12 }}>
                    <p style={{ color: '#f87171', fontSize: 14 }}>
                      World App not detected. Open this page inside the World App to publish.
                    </p>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', margin: '32px 0' }}>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>Connecting securely to your World App internal wallet...</p>
                    <button className="btn-primary" onClick={handleDetectWallet} style={{ width: '100%', padding: '16px' }}>
                      Detect Wallet Automatically →
                    </button>
                  </div>
                )
              ) : (
                <>
                  <div style={{ padding: '12px 16px', background: 'rgba(16,185,129,0.06)', borderRadius: 'var(--radius-md)', marginBottom: 24, fontSize: 13, color: 'var(--accent-emerald)', border: '1px solid rgba(16,185,129,0.2)' }}>
                    ✓ World App Wallet Detected: {walletAddress.slice(0, 10)}...{walletAddress.slice(-4)}
                  </div>
                   <WorldIDVerify
                    appId={WORLD_APP_ID}
                    action={WORLD_ACTION_ID}
                    onSuccess={handleVerifyWorldId}
                    signal={walletAddress.toLowerCase()}
                    onError={(err) => {
                      console.error('World ID Error Details:', err);
                      // Handle MiniKit vs IDKit error formats
                      const errorMsg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
                      setError(`Verification Error: ${errorMsg === '{}' ? 'Ensure "verify-author" exists in Production tab of Developer Portal' : errorMsg}`);
                    }}
                  />
                </>
              )}
            </div>
          )}

          {/* Step 2: Upload Paper */}
          {step === 'upload' && (
            <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div className="card" onClick={() => document.getElementById('file-input')?.click()} style={{ textAlign: 'center', cursor: 'pointer', border: '2px dashed var(--border)' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
                <p style={{ fontWeight: 600 }}>{file ? `✓ ${file.name}` : 'Select PDF Paper'}</p>
                <input id="file-input" type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} />
              </div>

              <div className="card">
                <h3 style={{ marginBottom: 20 }}>💰 Pricing</h3>
                <div className="grid-responsive">
                  <input className="input" value={priceQuery} onChange={(e) => setPriceQuery(e.target.value)} type="number" placeholder="Price per Query (USDC)" />
                  <input className="input" value={priceFull} onChange={(e) => setPriceFull(e.target.value)} type="number" placeholder="Full Access Price (USDC)" />
                </div>
              </div>

              <button type="submit" className="btn-primary" disabled={!file || uploading} style={{ width: '100%', padding: '16px' }}>
                {uploading ? '⏳ Working...' : '🚀 Publish & Register On-Chain'}
              </button>
            </form>
          )}

          {/* Step 3: Success */}
          {step === 'success' && uploadResult && (
            <div className="card" style={{ textAlign: 'center', padding: 48 }}>
              <div style={{ fontSize: 72, marginBottom: 24 }}>🎉</div>
              <h2 style={{ marginBottom: 16 }}>Success!</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>Your paper is now registered on World Chain Mainnet.</p>
              {uploadResult.paper_id && (
                <div style={{ 
                  background: 'rgba(255,255,255,0.03)', padding: 24, borderRadius: 16, 
                  border: '1px solid var(--border)', marginBottom: 32, textAlign: 'left' 
                }}>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase' }}>Direct PayLink (Share this!)</p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input 
                      readOnly 
                      className="input" 
                      value={`${window.location.origin}/pay/${uploadResult.paper_id}`} 
                      style={{ flex: 1, fontSize: 11, background: 'rgba(0,0,0,0.2)' }}
                    />
                    <button 
                      className="btn-primary" 
                      style={{ padding: '8px 16px', fontSize: 11 }}
                      onClick={() => {
                        const url = `${window.location.origin}/pay/${uploadResult.paper_id}`;
                        navigator.clipboard.writeText(url);
                        alert('¡Link copiado!');
                      }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <Link href="/dashboard" className="btn-secondary">View Dashboard</Link>
                <Link href="/explore" className="btn-primary">Go to Explore</Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
