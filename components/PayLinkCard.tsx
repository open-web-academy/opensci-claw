'use client';

import { useState } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';
import { parseUnits, encodeFunctionData } from 'viem';
import HandshakeMap from './HandshakeMap';

// Native USDC on World Chain (Mainnet)
const USDC_ADDRESS = '0x79A02482A880bCe3F13E09da970dC34dB4cD24D1';
const USDC_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
];

interface PayLinkCardProps {
  paperId: string;
  title: string;
  author: string;
  priceUsdc: string;
  serverUrl: string;
  onUnlock?: (signature: string) => void;
}

export default function PayLinkCard({ paperId, title, author, priceUsdc, serverUrl, onUnlock }: PayLinkCardProps) {
  const [status, setStatus] = useState<'idle' | 'charging' | 'verifying' | 'unlocked' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [logs, setLogs] = useState<{msg: string, type: 'info' | 'success' | 'warn' | 'error', detail?: string}[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [challenge, setChallenge] = useState<any>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<'world' | 'solana'>('world');
  const [solanaSignature, setSolanaSignature] = useState('');

  const addLog = (msg: string, type: 'info' | 'success' | 'warn' | 'error' = 'info', detail?: string) => {
    setLogs(prev => [...prev, { msg, type, detail }]);
  };

  const probeProtocol = async () => {
    try {
      setStatus('charging');
      setShowLogs(true);
      setLogs([]);
      
      const isAgent = paperId.startsWith('agent');
      const probeUrl = isAgent 
        ? `${serverUrl}/agent/${paperId.replace('agent-', '')}` 
        : `${serverUrl}/papers/${paperId}/full`;

      addLog(`Probing x402 Protocol...`, 'info', probeUrl);

      const initialRes = await fetch(probeUrl, {
        method: isAgent ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: isAgent ? JSON.stringify({ topic: 'probe' }) : undefined
      });

      if (initialRes.status === 200) {
        addLog('Access granted directly.', 'success');
        setStatus('unlocked');
        if (onUnlock) onUnlock('bypass');
        return;
      }

      if (initialRes.status === 402) {
        // The server sends PAYMENT-REQUIRED as plain JSON (not base64).
        // Fall back to parsing the body if the header is missing or truncated.
        const header = initialRes.headers.get('PAYMENT-REQUIRED');
        let decoded: any = null;
        if (header) {
          try {
            decoded = JSON.parse(header);
          } catch {
            try {
              decoded = JSON.parse(atob(header));
            } catch {
              decoded = null;
            }
          }
        }
        if (!decoded) {
          decoded = await initialRes.json().catch(() => null);
        }
        if (decoded) {
          setChallenge(decoded);
          addLog('Multi-chain challenge received.', 'success');
          setStatus('idle');
        } else {
          throw new Error('Unable to parse 402 challenge');
        }
      } else {
        throw new Error(`Server returned ${initialRes.status}`);
      }
    } catch (e: any) {
      addLog(`Connection failed: ${e.message}`, 'error');
      setStatus('error');
      setErrorMsg(e.message);
    }
  };

  const handleWorldPay = async (scheme: any) => {
    if (!MiniKit.isInstalled()) {
      setErrorMsg('Open in World App for MiniKit payments.');
      return;
    }
    try {
      setStatus('verifying');
      addLog('Invoking MiniKit...', 'info');

      const txResponse: any = await new Promise((resolve, reject) => {
        const handleTxResponse = (payload: any) => {
          (MiniKit as any).unsubscribe('send_transaction', handleTxResponse);
          fetch('/api/debug', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Card Tx Res', data: payload }) }).catch(() => {});
          if (payload.status === 'error') reject(new Error(payload.error_code));
          else resolve(payload);
        };
        (MiniKit as any).subscribe('send_transaction', handleTxResponse);

        // CAMBIO: Bypass de tipos para llamada directa
        (MiniKit as any).sendTransaction({
          transaction: [{
            address: USDC_ADDRESS,
            abi: USDC_ABI as any,
            functionName: 'transfer',
            args: [scheme.payTo, BigInt(scheme.amount).toString()],
          }],
        });
        setTimeout(() => { 
          (MiniKit as any).unsubscribe('send_transaction', handleTxResponse);
          reject(new Error('timeout')); 
        }, 120000);
      });

      const txId = (txResponse as any).transactionId || (txResponse as any).transactionHash || (txResponse as any).data?.transactionId;
      if (txId) {
        verifyPayment(txId);
      } else {
        throw new Error('Transaction cancelled');
      }
    } catch (e: any) {
      addLog(e.message, 'error');
      setStatus('idle');
    }
  };

  const handleSolanaPay = (scheme: any) => {
    const amount = (Number(scheme.amount) / 1e6).toFixed(6);
    const solanaLink = `solana:${scheme.payTo}?amount=${amount}&spl-token=${scheme.asset}&label=SciGate&message=Research%20Unlock`;
    addLog('Redirecting to Solana Pay...', 'info');
    window.location.href = solanaLink;
    setStatus('verifying');
  };

  const verifyPayment = async (signature: string) => {
    if (!signature) return;
    setStatus('verifying');
    addLog('Verifying on-chain signature...', 'info', signature);
    
    const isAgent = paperId.startsWith('agent');
    const unlockUrl = isAgent 
      ? `${serverUrl}/agent/${paperId.replace('agent-', '')}` 
      : `${serverUrl}/papers/${paperId}/full`;

    try {
      const res = await fetch(unlockUrl, {
        method: isAgent ? 'POST' : 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'PAYMENT-SIGNATURE': signature 
        },
        body: isAgent ? JSON.stringify({ topic: 'final_query' }) : undefined
      });

      if (res.status === 200) {
        addLog('Payment verified! Access granted.', 'success');
        setStatus('unlocked');
        if (onUnlock) onUnlock(signature);
      } else {
        const data = await res.json().catch(() => ({}));
        addLog(data.error || 'Invalid signature', 'error');
        setStatus('idle');
      }
    } catch (e: any) {
      addLog(e.message, 'error');
      setStatus('idle');
    }
  };

  const currentScheme = challenge?.accepts?.find((a: any) => {
    const net = String(a.network ?? '').toLowerCase();
    return selectedNetwork === 'world'
      ? net.startsWith('eip155:')
      : net.startsWith('solana:');
  });

  return (
    <div className="card w-full max-w-md relative overflow-hidden group">
      <div className="hero-glow" style={{ width: 300, height: 300, top: '-150px', right: '-150px', background: 'rgba(99,102,241,0.1)' }} />
      
      <div className="relative z-10 p-8">
        <div className="flex justify-between items-start mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl shadow-xl">
            {selectedNetwork === 'world' ? '🌍' : '☀️'}
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-[4px] font-black text-indigo-400 block mb-1">Price</span>
            <span className="gradient-text text-3xl font-black tracking-tighter">
              {priceUsdc} <span className="text-xs text-white/30 font-medium">USDC</span>
            </span>
          </div>
        </div>

        <div className="mb-6">
           <h1 className="text-2xl font-bold mb-2 leading-tight">{title}</h1>
           <p className="text-xs text-white/40">Researcher: {author.slice(0,10)}...</p>
        </div>

        {status === 'unlocked' ? (
          <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center animate-fade-in-up">
            <div className="text-4xl mb-2">✅</div>
            <h3 className="font-bold text-emerald-400">Acceso Concedido</h3>
            <p className="text-xs text-white/60">La investigación está lista.</p>
          </div>
        ) : !challenge ? (
          <button onClick={probeProtocol} disabled={status === 'charging'} className="btn-primary w-full h-16">
            {status === 'charging' ? 'HANDSHAKING...' : 'UNLOCK RESEARCH'}
          </button>
        ) : (
          <div className="space-y-6 animate-fade-in-up">
            <div className="flex p-1 bg-black/40 rounded-xl border border-white/5">
              <button 
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${selectedNetwork === 'world' ? 'bg-indigo-600 text-white' : 'text-white/40'}`}
                onClick={() => setSelectedNetwork('world')}
              >
                World Chain
              </button>
              <button 
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${selectedNetwork === 'solana' ? 'bg-purple-600 text-white' : 'text-white/40'}`}
                onClick={() => setSelectedNetwork('solana')}
              >
                Solana
              </button>
            </div>

            {currentScheme && (
              <div className="space-y-4">
                <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                  <div className="flex justify-between text-[10px] mb-2">
                    <span className="text-white/40">NETWORK</span>
                    <span className="text-indigo-400 font-bold">{selectedNetwork.toUpperCase()}</span>
                  </div>
                  <div className="text-[11px] font-mono break-all text-white/80">{currentScheme.payTo}</div>
                </div>

                {selectedNetwork === 'world' ? (
                  <button onClick={() => handleWorldPay(currentScheme)} disabled={status === 'verifying'} className="btn-primary w-full h-14">
                    {status === 'verifying' ? 'PROCESSING...' : 'PAY WITH WORLD APP'}
                  </button>
                ) : (
                  <div className="space-y-4">
                    <button onClick={() => handleSolanaPay(currentScheme)} className="w-full h-14 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-all">
                      PAY WITH PHANTOM
                    </button>
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="Paste Signature (TX ID)" 
                        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-[11px] font-mono text-white outline-none focus:border-purple-500"
                        value={solanaSignature}
                        onChange={(e) => setSolanaSignature(e.target.value)}
                      />
                      <button 
                        onClick={() => verifyPayment(solanaSignature)}
                        className="absolute right-2 top-2 bottom-2 px-4 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold"
                      >
                        VERIFY
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {showLogs && (
          <div className="mt-6 border-t border-white/5 pt-4">
            <HandshakeMap logs={logs} status={status} />
          </div>
        )}
      </div>
    </div>
  );
}
