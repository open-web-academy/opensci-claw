'use client';

import { MiniKit } from '@worldcoin/minikit-js';
import { useEffect, ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from '@/config/wagmi';

const queryClient = new QueryClient();

export default function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_WORLD_APP_ID;
    if (appId) {
      console.log('Installing MiniKit with App ID:', appId);
      MiniKit.install(appId);
    } else {
      console.warn('MiniKit App ID not found in environment variables');
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
