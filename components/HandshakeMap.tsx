'use client';

import { useEffect, useState } from 'react';

interface LogEntry {
  msg: string;
  type: 'info' | 'success' | 'warn' | 'error';
  detail?: string;
}

interface HandshakeMapProps {
  logs: LogEntry[];
  status: 'idle' | 'charging' | 'verifying' | 'unlocked' | 'error';
}

/**
 * HandshakeMap
 * A visual diagram representing the x402 protocol flow.
 * Shows data movement between Client, Facilitator, and Blockchain.
 */
export default function HandshakeMap({ logs, status }: HandshakeMapProps) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (status === 'charging') setActiveStep(1);
    if (status === 'verifying') setActiveStep(3);
    if (status === 'unlocked') setActiveStep(4);
    if (status === 'error') setActiveStep(0);
  }, [status]);

  const steps = [
    { id: 'client', label: 'Client Node', icon: '💻', description: 'Browser / Minikit' },
    { id: 'facilitator', label: 'Facilitator', icon: '📡', description: 'x402 World Server' },
    { id: 'blockchain', label: 'World Chain', icon: '⛓️', description: 'On-chain Settlement' },
    { id: 'rag', label: 'Agent Node', icon: '🧠', description: 'Raspberry Pi / RAG' },
  ];

  return (
    <div className="w-full bg-black/40 border border-white/5 rounded-[24px] p-8 overflow-hidden relative backdrop-blur-sm">
      {/* Connector lines (Global background) */}
      <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-white/5 -translate-y-1/2 hidden md:block"></div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 relative z-10">
        {steps.map((step, i) => {
          const isActive = (i === 0 && (status === 'idle' || status === 'charging')) || 
                           (i === 1 && status === 'charging') ||
                           (i === 2 && status === 'verifying') ||
                           (i === 3 && status === 'unlocked');
          
          return (
            <div key={step.id} className="flex flex-col items-center text-center group">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-xl transition-all duration-500 border shadow-2xl ${
                isActive 
                  ? 'bg-indigo-500 border-indigo-400 shadow-indigo-500/20 scale-110' 
                  : 'bg-white/5 border-white/10 opacity-30 group-hover:opacity-100'
              }`}>
                {step.icon}
                {isActive && (
                  <div className="absolute inset-x-0 -bottom-1 h-1 bg-indigo-300 rounded-full blur-[4px] animate-pulse"></div>
                )}
              </div>
              <div className="mt-4">
                <span className={`text-[9px] font-black uppercase tracking-[2px] transition-colors ${isActive ? 'text-indigo-400' : 'text-white/20'}`}>
                  {step.label}
                </span>
                <p className="text-[9px] text-white/10 font-mono mt-1 group-hover:text-white/40 transition-colors uppercase">
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Protocol Progress Bar */}
      <div className="mt-12 w-full h-1 bg-white/5 rounded-full overflow-hidden">
        <div 
          className="h-full bg-indigo-500 transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(99,102,241,1)]"
          style={{ width: `${(activeStep / 4) * 100}%` }}
        />
      </div>

      {/* Mini Console View */}
      <div className="mt-8 bg-black/40 rounded-2xl p-4 border border-white/5 font-mono text-[10px] text-indigo-300/60 max-h-[120px] overflow-y-auto no-scrollbar">
         {logs.slice(-3).map((log, i) => (
           <div key={i} className="mb-2 last:mb-0 animate-in fade-in slide-in-from-left-2 transition-all">
             <span className="opacity-30 mr-2">[{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
             <span className={
               log.type === 'success' ? 'text-emerald-400' : 
               log.type === 'warn' ? 'text-amber-400' : 
               log.type === 'error' ? 'text-red-400' : 'text-white/40'
             }>
               {log.msg}
             </span>
             {log.detail && <div className="pl-4 opacity-30 text-[9px] mt-0.5 break-all">↳ {log.detail}</div>}
           </div>
         ))}
         {status === 'charging' && <div className="text-white/20 animate-pulse mt-2">_AWAITING_CHALLENGE...</div>}
         {status === 'verifying' && <div className="text-indigo-400/50 animate-pulse mt-2">_VALIDATING_PROOF_ON_CHAIN...</div>}
      </div>
    </div>
  );
}
