'use client';

import { useEffect, ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from '@/config/wagmi';
import { MiniKitProvider } from '@worldcoin/minikit-js/minikit-provider';
import { MiniKit } from '@worldcoin/minikit-js';

const queryClient = new QueryClient();

export default function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    MiniKit.install();
  }, []);
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <MiniKitProvider props={{ appId: 'app_8d3e4ef96e0ef911d19e2e42107b16fb', environment: 'production' } as any}>
          {children}
        </MiniKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
