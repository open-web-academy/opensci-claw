import { createPublicClient, http, parseAbi } from 'viem';
import { WORLD_CHAIN_RPC, PAPER_REGISTRY_ADDRESS } from '../config.js';

const PAPER_REGISTRY_ABI = parseAbi([
  'function getPaper(bytes32 contentHash) view returns (bytes32 contentHash, address author, uint256 pricePerQuery, uint256 pricePerFull, uint256 trainingPrice, string metadataURI, uint256 totalEarnings, uint256 totalAccesses, bool active, uint256 createdAt)',
  'function getAuthorPapers(address author) view returns (bytes32[])',
  'function isPaperActive(bytes32 contentHash) view returns (bool)',
  'function getPaperStats(bytes32 contentHash) view returns (uint256 totalEarnings, uint256 totalAccesses)',
  'function exists(bytes32) view returns (bool)',
]);

const client = createPublicClient({
  transport: http(WORLD_CHAIN_RPC),
});

export interface PaperOnChain {
  contentHash: string;
  author: string;
  pricePerQuery: bigint;
  pricePerFull: bigint;
  trainingPrice: bigint;
  metadataURI: string;
  totalEarnings: bigint;
  totalAccesses: bigint;
  active: boolean;
  createdAt: bigint;
}

export async function getPaperFromChain(contentHash: `0x${string}`): Promise<PaperOnChain | null> {
  try {
    const paper = await client.readContract({
      address: PAPER_REGISTRY_ADDRESS,
      abi: PAPER_REGISTRY_ABI,
      functionName: 'getPaper',
      args: [contentHash],
    }) as any;
    return paper;
  } catch {
    return null;
  }
}

export async function getAuthorPapersFromChain(address: `0x${string}`): Promise<`0x${string}`[]> {
  try {
    const hashes = await client.readContract({
      address: PAPER_REGISTRY_ADDRESS,
      abi: PAPER_REGISTRY_ABI,
      functionName: 'getAuthorPapers',
      args: [address],
    }) as `0x${string}`[];
    return hashes;
  } catch {
    return [];
  }
}

export async function isPaperActive(contentHash: `0x${string}`): Promise<boolean> {
  try {
    return await client.readContract({
      address: PAPER_REGISTRY_ADDRESS,
      abi: PAPER_REGISTRY_ABI,
      functionName: 'isPaperActive',
      args: [contentHash],
    }) as boolean;
  } catch {
    return false;
  }
}

export async function getPaperStats(contentHash: `0x${string}`): Promise<{ totalEarnings: bigint; totalAccesses: bigint } | null> {
  try {
    const [totalEarnings, totalAccesses] = await client.readContract({
      address: PAPER_REGISTRY_ADDRESS,
      abi: PAPER_REGISTRY_ABI,
      functionName: 'getPaperStats',
      args: [contentHash],
    }) as [bigint, bigint];
    return { totalEarnings, totalAccesses };
  } catch {
    return null;
  }
}
