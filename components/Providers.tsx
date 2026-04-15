'use client';

import { useEffect, ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from '@/config/wagmi';

import { MiniKitProvider } from '@worldcoin/minikit-js/minikit-provider';

const queryClient = new QueryClient();

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <MiniKitProvider>
          {children}
        </MiniKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
