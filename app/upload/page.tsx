'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { parseUnits } from 'viem';
import { MiniKit } from '@worldcoin/minikit-js';
import { PAPER_REGISTRY_ABI } from '@/config/abi';

// Dynamic import for WorldIDVerify component (SSR: false)
const WorldIDVerify = dynamic(
  () => import('@/components/WorldIDVerify'),
  { ssr: false, loading: () => <button className="btn-primary" disabled style={{ width: '100%' }}>Loading Verification...</button> }
);

const API_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3001';
const RAG_URL  = process.env.NEXT_PUBLIC_RAG_URL ?? 'http://localhost:8000';
const WORLD_APP_ID    = process.env.NEXT_PUBLIC_WORLD_APP_ID    ?? 'app_staging_placeholder';
const WORLD_ACTION_ID = process.env.NEXT_PUBLIC_WORLD_ACTION_ID ?? 'verify-author';
const PAPER_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_PAPER_REGISTRY_ADDRESS;

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
    
    // Check if we are actually inside the World App
    if (!MiniKit.isInstalled()) {
      setMiniKitNotInstalled(true);
      setError('MiniKit is not installed in this browser. Showing manual input for testing.');
      return;
    }

    try {
      if (MiniKit.user?.walletAddress) {
        setWalletAddress(MiniKit.user.walletAddress);
        setWalletConfirmed(true);
        return;
      }

      // If not in state, request it via walletAuth
      const res = await MiniKit.commandsAsync.walletAuth({
        nonce: Date.now().toString(),
        requestId: 'auth_detect',
        expirationTime: new Date(Date.now() + 60 * 60 * 1000),
      });

      if (res.finalPayload.status === 'error') {
        throw new Error(`Wallet detection failed: ${res.finalPayload.error_code}`);
      }

      const address = res.finalPayload.address;
      if (address) {
        setWalletAddress(address);
        setWalletConfirmed(true);
      }
    } catch (err: any) {
      setError(err.message || 'Could not detect wallet. Are you in the World App?');
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

      // 2. Local/DB Registration (Off-chain)
      console.log('Registering paper off-chain...');
      // By skipping MiniKit on upload, we avoid the 'invalid_contract' error entirely here.
      // The smart contract is strictly reserved for the x402 payment agent during reads.

      // 3. Register author with World ID proof and pricing in Hono server
      const registerRes = await fetch('/api/authors/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          wallet_address: walletAddress, 
          world_id_proof: worldIdProof,
          paper_hash: contentHash,
          price_query: priceQuery,
          price_full: priceFull
        }),
      });

      if (!registerRes.ok) {
        const errData = await registerRes.json().catch(() => ({}));
        let detail = errData.detail || errData.error || 'Server connection failed';
        
        // Scrub HTML if it's an error page (like Render's 521 or 504)
        if (detail.includes('<html') || detail.includes('<!DOCTYPE')) {
          detail = 'The backend server (Render) is currently waking up or unreachable. Please wait 30 seconds and try again.';
        }
        
        throw new Error(`Registration failed: ${detail}`);
      }

      setUploadResult({
        ...ragData,
        walletAddress,
        priceQuery,
        priceFull,
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
              Upload and register on World Chain Sepolia.
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
                miniKitNotInstalled ? (
                  <div style={{ margin: '32px 0' }}>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>Manual Fallback (Testing Mode):</p>
                    <input
                      className="input"
                      value={walletAddress}
                      onChange={(e) => setWalletAddress(e.target.value)}
                      placeholder="Your Wallet Address (0x...)"
                      style={{ marginBottom: 16, width: '100%' }}
                    />
                    <button className="btn-primary" onClick={() => setWalletConfirmed(true)} disabled={!walletAddress} style={{ width: '100%', padding: '16px' }}>
                      Confirm Wallet →
                    </button>
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
                    onError={(err) => setError('Verification failed: ' + JSON.stringify(err))}
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
              <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>Your paper is now registered on World Chain Sepolia.</p>
              <Link href="/dashboard" className="btn-primary">View Dashboard</Link>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
