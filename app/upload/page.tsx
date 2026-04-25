'use client';

import { useState } from 'react';
import Link from 'next/link';
import { parseUnits, encodeFunctionData } from 'viem';
import dynamic from 'next/dynamic';
import { MiniKit } from '@worldcoin/minikit-js';
import { PAPER_REGISTRY_ABI } from '@/config/abi';

// Importación dinámica para evitar errores de exportación/SSR
const IDKitWidget: any = dynamic(
  () => import('@worldcoin/idkit').then((mod) => (mod as any).IDKitWidget),
  { ssr: false }
);

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

  const handleVerifySuccess = async (result: any) => {
    addLog('¡Verificación exitosa (IDKit)!', result);
    setWorldIdProof(result);

    try {
      const address = walletAddress || MiniKit.user?.walletAddress || '0x2eb655c6828d633e70c82b3b7eccac731d9b8ba7';
      const backendRes = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proof: result, wallet_address: address }),
      });
      const verifyData = await backendRes.json();
      if (!verifyData.success) throw new Error(verifyData.error || 'Fallo backend');
      
      addLog('Registro en backend exitoso ✓');
      setStep('upload');
    } catch (e: any) {
      setError(e.message);
      addLog(`Error backend: ${e.message}`);
    } finally {
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
      const ragData = await ragRes.json();
      const contentHash = ragData.hash;
      const paperIdStr = Math.floor(Math.random() * 1000000).toString();

      addLog('Preparando transacción v2...');
      
      const priceQueryUnits = parseUnits(priceQuery, 6);
      const priceFullUnits  = parseUnits(priceFull, 6);
      const trainingPrice   = parseUnits('0.15', 6);

      // CODIFICAR LA FUNCIÓN (Requerido en v2)
      const callData = encodeFunctionData({
        abi: PAPER_REGISTRY_ABI,
        functionName: 'registerPaper',
        args: [contentHash, `ipfs://demo/${paperIdStr}`, priceQueryUnits, priceFullUnits, trainingPrice],
      });

      const handleTxResponse = async (payload: any) => {
        (MiniKit as any).unsubscribe('send_transaction', handleTxResponse);
        addLog('Resultado transacción', payload);
        if (payload.status === 'success') {
          addLog('¡Transacción exitosa! ✓');
          setStep('success');
        } else {
          addLog('Transacción fallida ✗');
          setError('La transacción no se pudo completar.');
        }
        setUploading(false);
      };

      (MiniKit as any).subscribe('send_transaction', handleTxResponse);

      addLog('Enviando a World Chain (480)...');
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
      setUploading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 600, margin: '0 auto', padding: '40px 20px' }}>
      <header style={{ marginBottom: 40, textAlign: 'center' }}>
        <h1 className="gradient-text" style={{ fontSize: 42, marginBottom: 12 }}>SciGate</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 18 }}>Publica tu investigación de forma autónoma</p>
      </header>

      <main>
        {step === 'verify' && (
          <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <h2 style={{ marginBottom: 16 }}>🪪 Verificación de Autor</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>Usa el modal oficial de World ID para verificar tu humanidad.</p>
            
            <IDKitWidget
              app_id={WORLD_APP_ID as `app_${string}`}
              action={WORLD_ACTION_ID}
              onSuccess={handleVerifySuccess}
              handleVerify={() => addLog('Procesando prueba...')}
              verification_level="device"
              signal={walletAddress || MiniKit.user?.walletAddress || '0x2eb655c6828d633e70c82b3b7eccac731d9b8ba7'}
            >
              {({ open }: any) => (
                <button 
                  className="btn-primary" 
                  onClick={() => {
                    addLog('Abriendo IDKitWidget...');
                    open();
                  }} 
                  style={{ width: '100%', padding: 20, fontSize: 18 }}
                >
                  Verificar con World ID →
                </button>
              )}
            </IDKitWidget>

            {/* BOTÓN DE EMERGENCIA PARA EL HACKATHON */}
            <button 
              onClick={() => {
                addLog('Saltando verificación (Modo Dev)');
                setWorldIdProof({ success: true, mock: true });
                setStep('upload');
              }}
              style={{ marginTop: 16, background: 'transparent', border: '1px solid #333', color: '#666', width: '100%', padding: 10, borderRadius: 12, cursor: 'pointer', fontSize: 14 }}
            >
              ⏭️ Saltar verificación (Demo Mode)
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
              <p style={{ fontWeight: 600 }}>{file ? `✓ ${file.name}` : 'Seleccionar PDF'}</p>
              <input id="file-input" type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} />
            </div>

            <div className="card">
              <h3 style={{ marginBottom: 20 }}>💰 Precios (USDC)</h3>
              <div className="grid-responsive">
                <input className="input" value={priceQuery} onChange={(e) => setPriceQuery(e.target.value)} type="number" placeholder="Consulta" />
                <input className="input" value={priceFull} onChange={(e) => setPriceFull(e.target.value)} type="number" placeholder="Total" />
              </div>
            </div>

            <button type="submit" className="btn-primary" disabled={!file || uploading} style={{ width: '100%', padding: 20, fontSize: 18 }}>
              {uploading ? '⏳ Registrando...' : '🚀 Publicar Artículo'}
            </button>
          </form>
        )}

        {step === 'success' && (
          <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 64, marginBottom: 24 }}>🎉</div>
            <h2 style={{ marginBottom: 16 }}>¡Publicado!</h2>
            <Link href="/explore" className="btn-primary" style={{ display: 'inline-block', width: '100%', textDecoration: 'none' }}>Ver en el Explorador</Link>
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
