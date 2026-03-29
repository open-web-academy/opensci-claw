export const PAPER_REGISTRY_ABI = [
  {
    "type": "function",
    "name": "getAuthorPapers",
    "inputs": [{ "name": "author", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "bytes32[]", "internalType": "bytes32[]" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "registerPaper",
    "inputs": [
      { "name": "contentHash", "type": "bytes32", "internalType": "bytes32" },
      { "name": "metadataURI", "type": "string", "internalType": "string" },
      { "name": "pricePerQuery", "type": "uint256", "internalType": "uint256" },
      { "name": "pricePerFull", "type": "uint256", "internalType": "uint256" },
      { "name": "trainingPrice", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getPaper",
    "inputs": [{ "name": "contentHash", "type": "bytes32", "internalType": "bytes32" }],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct PaperRegistry.Paper",
        "components": [
          { "name": "contentHash", "type": "bytes32" },
          { "name": "author", "type": "address" },
          { "name": "pricePerQuery", "type": "uint256" },
          { "name": "pricePerFull", "type": "uint256" },
          { "name": "trainingPrice", "type": "uint256" },
          { "name": "metadataURI", "type": "string" },
          { "name": "totalEarnings", "type": "uint256" },
          { "name": "totalAccesses", "type": "uint256" },
          { "name": "active", "type": "bool" },
          { "name": "createdAt", "type": "uint256" }
        ]
      }
    ],
    "stateMutability": "view"
  }
] as const;
