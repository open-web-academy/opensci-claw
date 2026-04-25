'use client';

import { useEffect, ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from '@/config/wagmi';
import { MiniKit } from '@worldcoin/minikit-js';

const queryClient = new QueryClient();

export default function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Inicialización MiniKit v2 (ligera)
    try {
      MiniKit.install('app_8d3e4ef96e0ef911d19e2e42107b16fb');
      console.log('[MiniKit] Inicializado con v2');
    } catch (e) {
      console.error('[MiniKit] Error en init:', e);
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
