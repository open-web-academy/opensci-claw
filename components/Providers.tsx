'use client';

import { MiniKit } from '@worldcoin/minikit-js';
import { useEffect, ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from '@/config/wagmi';

const queryClient = new QueryClient();

export default function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    // FALLBACK: Usamos el ID de producción oficial
    const appId = process.env.NEXT_PUBLIC_WORLD_APP_ID || 'app_aacdf4487837b144901774135e3b0803';
    
    console.log('--- [MINIKIT INIT] ---');
    console.log('Target App ID:', appId);
    
    if (appId) {
      MiniKit.install(appId);
    }
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
