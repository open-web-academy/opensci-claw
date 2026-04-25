'use client';

import { useState } from 'react';
import Link from 'next/link';
import { parseUnits } from 'viem';
import { MiniKit } from '@worldcoin/minikit-js';
import { PAPER_REGISTRY_ABI } from '@/config/abi';

const WORLD_APP_ID = "app_8d3e4ef96e0ef911d19e2e42107b16fb";
const WORLD_ACTION_ID = "verify-author";
const PAPER_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_PAPER_REGISTRY_ADDRESS ?? '';

type Step = 'verify' | 'upload' | 'success';

export default function UploadPage() {
  const [step, setStep] = useState<Step>('verify');
  const [worldIdProof, setWorldIdProof] = useState<any>(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [priceQuery, setPriceQuery] = useState('0.10');
  const [priceFull, setPriceFull] = useState('5.00');

  const addLog = (msg: string) => {
    setDebugLogs(prev => [msg, ...prev].slice(0, 5));
    console.log(`[MOBILE_DEBUG] ${msg}`);
  };

  const handleDetectAndVerify = async () => {
    setError('');
    addLog('--- INICIANDO FLUJO v2 ---');
    
    try {
      // 1. Obtener Wallet (v2 ya tiene el usuario si está instalado)
      let address = MiniKit.user?.walletAddress || '';
      
      if (!address) {
        addLog('Pidiendo walletAuth...');
        // En v2, podemos intentar forzar la detección
        address = '0x2eb655c6828d633e70c82b3b7eccac731d9b8ba7'; // Fallback demo
        addLog('Usando wallet de respaldo.');
      }

      setWalletAddress(address);
      setIsVerifying(true);

      // 2. Verificación World ID (MiniKit v2 nativo)
      addLog('Lanzando World ID modal...');
      
      // En v2.x, el modal se lanza y el resultado llega por evento
      (MiniKit as any).commands.verify({
        action: WORLD_ACTION_ID,
        signal: address.toLowerCase(),
      });

      addLog('Esperando respuesta del modal...');
      
      const handleVerifyResponse = async (payload: any) => {
        (MiniKit as any).unsubscribe('verify', handleVerifyResponse);
        if (payload.status === 'error') {
          addLog(`Error en modal: ${payload.error_code}`);
          setError('Error en el modal de World ID');
          setIsVerifying(false);
          return;
        }

        addLog('¡Verificación OK! Registrando...');
        setWorldIdProof(payload);

        // Registrar en Backend
        try {
          const backendRes = await fetch('/api/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ proof: payload, wallet_address: address }),
          });
          const verifyData = await backendRes.json();
          if (!verifyData.success) throw new Error(verifyData.error || 'Fallo backend');
          
          addLog('Registro exitoso.');
          setStep('upload');
        } catch (e: any) {
          setError(e.message);
          addLog(`Error backend: ${e.message}`);
        } finally {
          setIsVerifying(false);
        }
      };

      (MiniKit as any).subscribe('verify', handleVerifyResponse);

    } catch (err: any) {
      addLog(`Error: ${err.message}`);
      setError(err.message);
      setIsVerifying(false);
    }
  };

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !worldIdProof || !walletAddress) return;
    setUploading(true);
    setError('');

    try {
      // (Lógica de subida RAG igual...)
      const formData = new FormData();
      formData.append('file', file);
      const ragRes = await fetch('/api/rag/upload', { method: 'POST', body: formData });
      const ragData = await ragRes.json();
      const contentHash = ragData.hash;
      const paperIdStr = Math.floor(Math.random() * 1000000).toString();

      addLog('Enviando transacción a World Chain...');
      
      const priceQueryUnits = parseUnits(priceQuery, 6);
      const priceFullUnits  = parseUnits(priceFull, 6);
      const trainingPrice   = parseUnits('0.15', 6);

      // Transacción vía MiniKit v2
      (MiniKit as any).commands.sendTransaction({
        transaction: [{
          address: PAPER_REGISTRY_ADDRESS,
          abi: PAPER_REGISTRY_ABI,
          functionName: 'registerPaper',
          args: [contentHash, `ipfs://demo/${paperIdStr}`, priceQueryUnits.toString(), priceFullUnits.toString(), trainingPrice.toString()],
        }],
      });

      const handleTxResponse = async (payload: any) => {
        (MiniKit as any).unsubscribe('send_transaction', handleTxResponse);
        if (payload.status === 'success') {
          addLog('Transacción exitosa.');
          setStep('success');
        } else {
          addLog('Transacción fallida.');
          setError('La transacción no se pudo completar.');
        }
        setUploading(false);
      };

      (MiniKit as any).subscribe('send_transaction', handleTxResponse);

    } catch (err: any) {
      setError(err.message);
      setUploading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 600, margin: '0 auto', padding: '40px 20px' }}>
      <header style={{ marginBottom: 40, textAlign: 'center' }}>
        <h1 className="gradient-text" style={{ fontSize: 42, marginBottom: 12 }}>SciGate</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 18 }}>Publica tu investigación científia de forma autónoma</p>
      </header>

      <main>
        {step === 'verify' && (
          <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <h2 style={{ marginBottom: 16 }}>🪪 Verificación de Autor</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>Lanza el modal de World ID para verificar tu identidad humana.</p>
            
            <button 
              className="btn-primary" 
              onClick={handleDetectAndVerify} 
              disabled={isVerifying}
              style={{ width: '100%', padding: 20, fontSize: 18 }}
            >
              {isVerifying ? '⏳ Esperando World ID...' : 'Verificar con World ID →'}
            </button>

            {debugLogs.length > 0 && (
              <div style={{ marginTop: 24, textAlign: 'left', fontSize: 12, background: '#111', padding: 12, borderRadius: 8, border: '1px solid #333' }}>
                <div style={{ color: '#666', marginBottom: 4 }}>LOGS:</div>
                {debugLogs.map((log, i) => <div key={i} style={{ color: i === 0 ? 'var(--accent-emerald)' : '#888' }}>&gt; {log}</div>)}
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
                  <label style={{ fontSize: 12 }}>Precio por Consulta</label>
                  <input className="input" value={priceQuery} onChange={(e) => setPriceQuery(e.target.value)} type="number" step="0.01" />
                </div>
                <div className="input-group">
                  <label style={{ fontSize: 12 }}>Precio Acceso Total</label>
                  <input className="input" value={priceFull} onChange={(e) => setPriceFull(e.target.value)} type="number" step="0.01" />
                </div>
              </div>
            </div>

            <button type="submit" className="btn-primary" disabled={!file || uploading} style={{ width: '100%', padding: 20, fontSize: 18 }}>
              {uploading ? '⏳ Registrando...' : '🚀 Publicar y Registrar'}
            </button>
          </form>
        )}

        {step === 'success' && (
          <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 64, marginBottom: 24 }}>🎉</div>
            <h2 style={{ marginBottom: 16 }}>¡Investigación Publicada!</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>Tu artículo ya está disponible en la red SciGate.</p>
            <Link href="/explore" className="btn-primary" style={{ display: 'inline-block', width: '100%', textDecoration: 'none' }}>Ver en el Explorador</Link>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 20, padding: 16, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-ruby)', borderRadius: 12, color: 'var(--accent-ruby)', fontSize: 14 }}>
            ⚠️ {error}
          </div>
        )}
      </main>
    </div>
  );
}
