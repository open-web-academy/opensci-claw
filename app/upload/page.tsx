'use client';

import { useState } from 'react';
import Link from 'next/link';
import { parseUnits, encodeFunctionData } from 'viem';
import { MiniKit } from '@worldcoin/minikit-js';
import { IDKit, CredentialRequest, any, deviceLegacy } from '@worldcoin/idkit-core';
import { PAPER_REGISTRY_ABI } from '@/config/abi';

const API_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3001';
const RAG_URL = process.env.NEXT_PUBLIC_RAG_URL ?? 'http://localhost:8000';
const WORLD_ACTION_ID = process.env.NEXT_PUBLIC_WORLD_ACTION_ID ?? 'verify-author';
const PAPER_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_PAPER_REGISTRY_ADDRESS ?? '';
const WORLD_APP_ID = (process.env.NEXT_PUBLIC_WORLD_APP_ID ?? 'app_aacdf4487837b144901774135e3b0803') as `app_${string}`;
const RP_ID = process.env.NEXT_PUBLIC_RP_ID ?? 'rp_e2b239675f4bd84b';

type Step = 'verify' | 'upload' | 'success';

export default function UploadPage() {
  const [step, setStep] = useState<Step>('verify');
  const [worldIdProof, setWorldIdProof] = useState<any>(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [walletConfirmed, setWalletConfirmed] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [error, setError] = useState('');

  const [priceQuery, setPriceQuery] = useState('0.01');
  const [priceFull, setPriceFull] = useState('0.10');

  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const addLog = async (msg: string) => {
    console.log(`[DEBUG] ${msg}`);
    setDebugLogs(prev => [msg, ...prev].slice(0, 8));
    
    // Enviar a Render (Consola)
    try {
      await fetch(`${API_URL}/api/debug/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg, device: walletAddress || 'initial' })
      });
    } catch(e) {}
  };

  // ── FLUJO PRINCIPAL: Wallet Auth + World ID via IDKit ──────────
  const handleDetectAndVerify = async () => {
    setError('');
    addLog('--- INICIANDO FLUJO ---');
    
    if (!MiniKit.isInstalled()) {
      setError('Por favor, abre esta app dentro de World App.');
      addLog('Error: MiniKit no instalado');
      return;
    }

    try {
      // ── PASO 1: Obtener wallet vía walletAuth ──
      addLog('Paso 1: Solicitando walletAuth...');
      const authRes = await (MiniKit as any).walletAuth({
        nonce: Math.random().toString(36).substring(2),
        requestId: 'scigate_auth',
        expirationTime: new Date(Date.now() + 1000 * 60 * 60),
      });

      if (!authRes.data?.address) {
        throw new Error('No se obtuvo dirección de wallet');
      }

      const address = authRes.data.address;
      addLog(`Wallet OK: ${address.slice(0, 10)}...`);
      setWalletAddress(address);
      setWalletConfirmed(true);
      setIsVerifying(true);

      // ── PASO 2: Obtener firma RP del backend ──
      addLog('Paso 2: Obteniendo firma RP...');
      const FULL_ACTION_ID = `${WORLD_APP_ID}:${WORLD_ACTION_ID}`;
      
      const rpSigRes = await fetch(`${API_URL}/api/world-id/rp-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: WORLD_ACTION_ID,
          signal: address.toLowerCase(),
          app_id: WORLD_APP_ID
        }),
      });

      if (!rpSigRes.ok) {
        throw new Error('No se pudo obtener la firma RP del backend');
      }

      const rpSig = await rpSigRes.json();
      addLog('Firma RP obtenida ✓');

      // ── PASO 3: Lanzar verificación World ID vía IDKit ──
      addLog('Paso 3: Lanzando World ID (IDKit)...');
      
      const safeRpId = rpSig.rp_id || RP_ID;
      
      const idkitPayload = {
        app_id: WORLD_APP_ID, 
        action: WORLD_ACTION_ID, 
        rp_context: {
          rp_id: safeRpId,
          nonce: rpSig.nonce,
          created_at: rpSig.created_at,
          expires_at: rpSig.expires_at,
          signature: rpSig.signature,
        },
        allow_legacy_proofs: true,
        environment: 'production',
      };
      
      const request = await IDKit.request(idkitPayload as any).preset(deviceLegacy({ signal: address.toLowerCase() }));
      
      addLog('Esperando verificación del usuario...');
      const completion = await request.pollUntilCompletion({ timeout: 120000 });

      if (!completion.success) {
        addLog(`World ID falló: ${completion.error}`);
        throw new Error(`Verificación World ID fallida: ${completion.error}`);
      }

      addLog('World ID verificado ✓');
      const idkitResult = completion.result;

      // ── PASO 4: Registrar en Smart Contract ──
      addLog('Paso 4: Registrando en blockchain...');
      const verifyRes = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proof: idkitResult,
          wallet_address: address,
        }),
      });

      const verifyData = await verifyRes.json();
      if (verifyData.success) {
        addLog('¡VERIFICACIÓN COMPLETA! ✓✓✓');
        setWorldIdProof(idkitResult);
        setStep('upload');
      } else {
        throw new Error('Verificación backend falló: ' + (verifyData.error ?? 'unknown'));
      }

    } catch (err: any) {
      const errMsg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
      addLog(`Error: ${errMsg}`);
      setError(errMsg || 'Error inesperado');
      setWalletConfirmed(false);
      setIsVerifying(false);
    }
  };

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !worldIdProof || !walletAddress) return;
    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      const ragRes = await fetch('/api/rag/upload', { method: 'POST', body: formData });
      if (!ragRes.ok) throw new Error('RAG upload failed');
      
      const ragData = await ragRes.json();
      const paperIdStr = String(ragData.paper_id);
      const contentHash = paperIdStr.startsWith('0x') ? paperIdStr : `0x${paperIdStr}`;

      const priceQueryUnits = parseUnits(priceQuery, 6);
      const priceFullUnits  = parseUnits(priceFull, 6);
      const trainingPrice   = parseUnits('0.15', 6);

      const calldata = encodeFunctionData({
        abi: PAPER_REGISTRY_ABI,
        functionName: 'registerPaper',
        args: [contentHash as `0x${string}`, `ipfs://placeholder/${paperIdStr}`, priceQueryUnits, priceFullUnits, trainingPrice],
      });

      const response = await MiniKit.sendTransaction({
        transactions: [{ to: PAPER_REGISTRY_ADDRESS as `0x${string}`, data: calldata, value: '0' }],
        chainId: 480,
      });

      const txId = (response as any).data?.transactionId || (response as any).data?.transactionHash;
      if (!txId) throw new Error('Registro en cadena cancelado');

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

      if (!registerRes.ok) throw new Error('Error al registrar autor en servidor');

      setUploadResult({ ...ragData, walletAddress, priceQuery, priceFull, txHash: txId });
      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Algo salió mal en la subida');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <nav><div className="nav-inner"><Link href="/" className="nav-logo">⬡ SciGate</Link></div></nav>

      <main style={{ paddingTop: 100, minHeight: '100vh', paddingBottom: 80 }}>
        <div className="container" style={{ maxWidth: 700 }}>
          <div style={{ marginBottom: 48 }}>
            <h1 style={{ fontSize: 40, marginBottom: 12 }}>Publish Your <span className="gradient-text">Research</span></h1>
            <p style={{ color: 'var(--text-secondary)' }}>Upload and register on World Chain Mainnet.</p>
          </div>

          {error && (
            <div style={{ padding: 16, background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 12, color: '#f87171', marginBottom: 24 }}>
              ⚠️ {error}
            </div>
          )}

          {debugLogs.length > 0 && (
            <div style={{ padding: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 12, marginBottom: 24, fontSize: 10, fontFamily: 'monospace', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: 4, fontWeight: 'bold' }}>SYSTEM LOGS:</div>
              {debugLogs.map((log, i) => <div key={i} style={{ color: i === 0 ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>&gt; {log}</div>)}
            </div>
          )}

          {step === 'verify' && (
            <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <h2 style={{ marginBottom: 16 }}>🪪 Verificación de Autor</h2>
              
              {!walletConfirmed ? (
                <>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>Conecta tu World App para verificar tu identidad y wallet en un solo paso.</p>
                  <button className="btn-primary" onClick={handleDetectAndVerify} style={{ width: '100%', padding: 20, fontSize: 18 }}>
                    Conectar y Verificar →
                  </button>
                </>
              ) : (
                <div style={{ padding: '20px 0' }}>
                  <div className="spinner" style={{ margin: '0 auto 24px' }}></div>
                  <p style={{ color: 'var(--accent-emerald)', fontWeight: 700, fontSize: 18 }}>¡Wallet Conectada!</p>
                  <p style={{ color: 'var(--text-secondary)' }}>Lanzando World ID automáticamente...</p>
                </div>
              )}
            </div>
          )}

          {step === 'upload' && (
            <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div className="card" onClick={() => document.getElementById('file-input')?.click()} style={{ textAlign: 'center', cursor: 'pointer', border: '2px dashed var(--border)' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
                <p style={{ fontWeight: 600 }}>{file ? `✓ ${file.name}` : 'Seleccionar PDF de Investigación'}</p>
                <input id="file-input" type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} />
              </div>

              <div className="card">
                <h3 style={{ marginBottom: 20 }}>💰 Configurar Precios (USDC)</h3>
                <div className="grid-responsive">
                  <div className="input-group">
                    <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Precio por Consulta</label>
                    <input className="input" value={priceQuery} onChange={(e) => setPriceQuery(e.target.value)} type="number" step="0.01" />
                  </div>
                  <div className="input-group">
                    <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Precio Acceso Total</label>
                    <input className="input" value={priceFull} onChange={(e) => setPriceFull(e.target.value)} type="number" step="0.01" />
                  </div>
                </div>
              </div>

              <button type="submit" className="btn-primary" disabled={!file || uploading} style={{ width: '100%', padding: 20, fontSize: 18 }}>
                {uploading ? '⏳ Registrando en World Chain...' : '🚀 Publicar y Registrar'}
              </button>
            </form>
          )}

          {step === 'success' && (
            <div className="card" style={{ textAlign: 'center', padding: 48 }}>
              <div style={{ fontSize: 72, marginBottom: 24 }}>🎉</div>
              <h2 style={{ marginBottom: 16 }}>¡Publicado con Éxito!</h2>
              <p style={{ color: 'var(--text-secondary)' }}>Tu investigación ya es accesible para agentes de IA en World Chain.</p>
              <div style={{ marginTop: 32 }}>
                <Link href="/dashboard" className="btn-primary">Ir al Panel de Control</Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
