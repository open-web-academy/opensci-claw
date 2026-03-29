'use client';

import { http, createConfig, injected } from 'wagmi';
import { walletConnect } from 'wagmi/connectors';
import { mainnet } from 'wagmi/chains';

// Define World Chain Sepolia
export const worldChainSepolia = {
  id: 4801,
  name: 'World Chain Sepolia',
  network: 'world-chain-sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://worldchain-sepolia.g.alchemy.com/public'] },
    public: { http: ['https://worldchain-sepolia.g.alchemy.com/public'] },
  },
  blockExplorers: {
    default: { name: 'WorldScan', url: 'https://sepolia.worldscan.org' },
  },
  testnet: true,
} as const;

// Using a public placeholder projectId for the hackathon demo resilient connection
const projectId = 'b43d41f12d2110c710d29d33adcf4d6d';

export const config = createConfig({
  chains: [worldChainSepolia, mainnet],
  connectors: [
    injected(),
    walletConnect({ projectId }),
  ],
  transports: {
    [worldChainSepolia.id]: http(),
    [mainnet.id]: http(),
  },
});
