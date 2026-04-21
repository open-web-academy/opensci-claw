'use client';

import { useState, useEffect, useRef } from 'react';

interface ProgressEvent {
  status: 'searching' | 'negotiating' | 'paying' | 'analyzing' | 'done' | 'error';
  message: string;
  data?: any;
}

interface AgentControlProps {
  paymentSignature?: string;
  serverUrl?: string;
  initialTopic?: string;
  mode?: 'query' | 'full';
}

export default function AgentControl({ paymentSignature, serverUrl, initialTopic, mode = 'full' }: AgentControlProps) {
  const [topic, setTopic] = useState(initialTopic || '');
  const [logs, setLogs] = useState<ProgressEvent[]>([]);
  const [isWorking, setIsWorking] = useState(false);
  const [finalAnswer, setFinalAnswer] = useState<any>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Auto-start if initialTopic is provided
  useEffect(() => {
    if (initialTopic && paymentSignature && !hasStartedRef.current) {
      hasStartedRef.current = true;
      // Trigger startAgent manually without an event
      handleStartFlow(initialTopic);
    }
  }, [initialTopic, paymentSignature]);

  const handleStartFlow = async (queryTopic: string) => {
    if (!queryTopic.trim()) return;

    setLogs([]);
    setIsWorking(true);
    setFinalAnswer(null);

    try {
      const endpoint = serverUrl ? `${serverUrl}/agent/${mode}` : `/api/agent/${mode}`;
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(paymentSignature ? { 'PAYMENT-SIGNATURE': paymentSignature } : {})
        },
        body: JSON.stringify({ topic: queryTopic }),
      });

      if (!response.body) throw new Error('No response stream');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: ProgressEvent = JSON.parse(line.replace('data: ', ''));
              setLogs((prev) => [...prev, event]);
              if (event.status === 'done') {
                setFinalAnswer(event.data);
                setIsWorking(false);
              }
              if (event.status === 'error') {
                setIsWorking(false);
              }
            } catch (e) {
              console.error('Error parsing SSE:', e);
            }
          }
        }
      }
    } catch (err: any) {
      setLogs((prev) => [...prev, { status: 'error', message: err.message }]);
      setIsWorking(false);
    }
  };

  const startAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    handleStartFlow(topic);
  };

  const currentStatus = logs[logs.length - 1]?.status || 'idle';

  return (
    <div className="agent-container">
      <div className="agent-header">
        <div className="status-indicator">
          <div className={`pulse ${isWorking ? 'active' : ''}`} />
          <span>{isWorking ? 'Agent NanoClaw is Active' : 'Agent Idle'}</span>
        </div>
        <h3>⬡ Autonomous Researcher</h3>
      </div>

      <form onSubmit={startAgent} className="agent-input-group">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="What should the agent investigate? (e.g. LLM quantization)"
          disabled={isWorking}
        />
        <button type="submit" disabled={isWorking || !topic.trim()}>
          {isWorking ? 'Processing...' : 'Deploy Agent'}
        </button>
      </form>

      {logs.length > 0 && (
        <div className="log-panel">
          <div className="log-header">INTERNAL MONOLOGUE</div>
          <div className="log-content">
            {logs.map((log, i) => (
              <div key={i} className={`log-entry ${log.status}`}>
                <span className="log-icon">
                  {log.status === 'searching' && '🔍'}
                  {log.status === 'negotiating' && '🤝'}
                  {log.status === 'paying' && '💰'}
                  {log.status === 'analyzing' && '🧠'}
                  {log.status === 'done' && '✅'}
                  {log.status === 'error' && '❌'}
                </span>
                <span className="log-msg">{log.message}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {finalAnswer && (
        <div className="final-result-card">
          <div className="result-label">SYNTHESIZED ANSWER</div>
          <div className="paper-ref">
            Source: {finalAnswer.paper_id?.slice(0, 12)}...
          </div>
          <p>{finalAnswer.answer}</p>
        </div>
      )}

      <style jsx>{`
        .agent-container {
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 20px;
          padding: 30px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          margin-bottom: 40px;
        }
        .agent-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 25px;
        }
        .status-indicator {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .pulse {
          width: 8px;
          height: 8px;
          background: #475569;
          border-radius: 50%;
        }
        .pulse.active {
          background: #10b981;
          box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
          animation: pulse-ring 1.5s infinite;
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        h3 {
          margin: 0;
          font-size: 18px;
          background: linear-gradient(to right, #818cf8, #34d399);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .agent-input-group {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
        }
        input {
          flex: 1;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 14px 20px;
          color: white;
          outline: none;
          transition: border-color 0.2s;
        }
        input:focus {
          border-color: rgba(99, 102, 241, 0.5);
        }
        button {
          background: #6366f1;
          color: white;
          border: none;
          border-radius: 12px;
          padding: 0 24px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        button:hover:not(:disabled) {
          background: #4f46e5;
          transform: translateY(-1px);
        }
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .log-panel {
          background: #020617;
          border-radius: 12px;
          padding: 20px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          max-height: 250px;
          overflow-y: auto;
        }
        .log-header {
          font-size: 10px;
          color: #475569;
          font-weight: 800;
          margin-bottom: 12px;
          letter-spacing: 0.1em;
        }
        .log-entry {
          display: flex;
          gap: 12px;
          margin-bottom: 10px;
          font-size: 13px;
          animation: slideIn 0.3s ease-out backwards;
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .log-msg { color: #cbd5e1; }
        .log-entry.paying .log-msg { color: #34d399; font-weight: 600; }
        .log-entry.error .log-msg { color: #f87171; }
        
        .final-result-card {
          margin-top: 25px;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%);
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 16px;
          padding: 24px;
        }
        .result-label {
          font-size: 11px;
          font-weight: 800;
          color: #818cf8;
          margin-bottom: 4px;
        }
        .paper-ref {
          font-size: 10px;
          color: #64748b;
          margin-bottom: 16px;
          font-family: monospace;
        }
        p {
          color: #e2e8f0;
          line-height: 1.7;
          font-size: 15px;
          margin: 0;
        }
      `}</style>
    </div>
  );
}
