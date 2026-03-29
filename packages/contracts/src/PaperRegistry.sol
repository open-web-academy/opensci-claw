// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PaperRegistry
 * @notice Registry for academic papers on World Chain. Tracks paper metadata,
 * author earnings, and access counts. Payments flow via x402 (off-chain),
 * this contract only records metadata and analytics.
 */
contract PaperRegistry {
    // =========================================================================
    // Types
    // =========================================================================

    struct Paper {
        bytes32 contentHash;      // SHA256 of the original PDF
        address payable author;   // Author's wallet address
        uint256 pricePerQuery;    // Price in USDC atomic units (6 decimals) for /query
        uint256 pricePerFull;     // Price in USDC atomic units for /full
        uint256 trainingPrice;    // Price in USDC atomic units for training license
        string metadataURI;       // IPFS URI with full metadata (title, abstract, etc.)
        uint256 totalEarnings;    // Cumulative earnings in USDC atomic units
        uint256 totalAccesses;    // Total number of paid accesses
        bool active;              // Whether the paper is accepting queries
        uint256 createdAt;        // Block timestamp of registration
    }

    // =========================================================================
    // State
    // =========================================================================

    /// @notice Paper data by contentHash
    mapping(bytes32 => Paper) public papers;

    /// @notice List of paper hashes per author
    mapping(address => bytes32[]) public authorPapers;

    /// @notice Tracks who registered which paper (for access control)
    mapping(bytes32 => bool) public exists;

    /// @notice Owner has special admin privileges
    address public owner;

    // =========================================================================
    // Events
    // =========================================================================

    event PaperRegistered(
        bytes32 indexed contentHash,
        address indexed author,
        string metadataURI,
        uint256 pricePerQuery,
        uint256 pricePerFull,
        uint256 timestamp
    );

    event PaperAccessed(
        bytes32 indexed contentHash,
        address indexed author,
        string accessType,  // "query", "full", "section", "citations", "data"
        uint256 amount,     // USDC atomic units paid
        uint256 timestamp
    );

    event EarningsWithdrawn(
        address indexed author,
        uint256 amount,
        uint256 timestamp
    );

    event PricingUpdated(
        bytes32 indexed contentHash,
        uint256 pricePerQuery,
        uint256 pricePerFull,
        uint256 trainingPrice
    );

    // =========================================================================
    // Modifiers
    // =========================================================================

    modifier onlyOwner() {
        require(msg.sender == owner, "PaperRegistry: not owner");
        _;
    }

    modifier onlyAuthor(bytes32 contentHash) {
        require(papers[contentHash].author == msg.sender, "PaperRegistry: not author");
        _;
    }

    modifier paperExists(bytes32 contentHash) {
        require(exists[contentHash], "PaperRegistry: paper not found");
        _;
    }

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor() {
        owner = msg.sender;
    }

    // =========================================================================
    // Write Functions
    // =========================================================================

    /**
     * @notice Register a new academic paper
     * @param contentHash SHA256 hash of the PDF (used as unique identifier)
     * @param metadataURI IPFS URI with title, abstract, authors, DOI
     * @param pricePerQuery Price in USDC atomic units (e.g., 10000 = $0.01)
     * @param pricePerFull Price in USDC atomic units for full text access
     * @param trainingPrice Price in USDC atomic units for training license
     */
    function registerPaper(
        bytes32 contentHash,
        string calldata metadataURI,
        uint256 pricePerQuery,
        uint256 pricePerFull,
        uint256 trainingPrice
    ) external {
        require(!exists[contentHash], "PaperRegistry: paper already registered");
        require(pricePerQuery > 0, "PaperRegistry: query price must be > 0");
        require(bytes(metadataURI).length > 0, "PaperRegistry: metadata URI required");

        papers[contentHash] = Paper({
            contentHash: contentHash,
            author: payable(msg.sender),
            pricePerQuery: pricePerQuery,
            pricePerFull: pricePerFull,
            trainingPrice: trainingPrice,
            metadataURI: metadataURI,
            totalEarnings: 0,
            totalAccesses: 0,
            active: true,
            createdAt: block.timestamp
        });

        exists[contentHash] = true;
        authorPapers[msg.sender].push(contentHash);

        emit PaperRegistered(
            contentHash,
            msg.sender,
            metadataURI,
            pricePerQuery,
            pricePerFull,
            block.timestamp
        );
    }

    /**
     * @notice Record a paid access to a paper (called by backend after x402 payment verified)
     * @dev In MVP, only the contract owner (backend wallet) can call this.
     *      In v2, this would be gated by an on-chain payment splitter.
     */
    function recordAccess(
        bytes32 contentHash,
        string calldata accessType,
        uint256 amount
    ) external onlyOwner paperExists(contentHash) {
        require(papers[contentHash].active, "PaperRegistry: paper not active");

        papers[contentHash].totalEarnings += amount;
        papers[contentHash].totalAccesses += 1;

        emit PaperAccessed(
            contentHash,
            papers[contentHash].author,
            accessType,
            amount,
            block.timestamp
        );
    }

    /**
     * @notice Update pricing for a paper
     */
    function updatePricing(
        bytes32 contentHash,
        uint256 pricePerQuery,
        uint256 pricePerFull,
        uint256 trainingPrice
    ) external onlyAuthor(contentHash) paperExists(contentHash) {
        require(pricePerQuery > 0, "PaperRegistry: query price must be > 0");

        papers[contentHash].pricePerQuery = pricePerQuery;
        papers[contentHash].pricePerFull = pricePerFull;
        papers[contentHash].trainingPrice = trainingPrice;

        emit PricingUpdated(contentHash, pricePerQuery, pricePerFull, trainingPrice);
    }

    /**
     * @notice Deactivate a paper (stops accepting queries)
     */
    function deactivatePaper(bytes32 contentHash)
        external
        onlyAuthor(contentHash)
        paperExists(contentHash)
    {
        papers[contentHash].active = false;
    }

    /**
     * @notice Reactivate a previously deactivated paper
     */
    function reactivatePaper(bytes32 contentHash)
        external
        onlyAuthor(contentHash)
        paperExists(contentHash)
    {
        papers[contentHash].active = true;
    }

    // =========================================================================
    // Read Functions
    // =========================================================================

    /**
     * @notice Get all papers by an author
     */
    function getAuthorPapers(address author) external view returns (bytes32[] memory) {
        return authorPapers[author];
    }

    /**
     * @notice Get paper details
     */
    function getPaper(bytes32 contentHash) external view returns (Paper memory) {
        require(exists[contentHash], "PaperRegistry: paper not found");
        return papers[contentHash];
    }

    /**
     * @notice Check if a paper is active and accepting queries
     */
    function isPaperActive(bytes32 contentHash) external view returns (bool) {
        return exists[contentHash] && papers[contentHash].active;
    }

    /**
     * @notice Get earnings and access stats for a paper
     */
    function getPaperStats(bytes32 contentHash)
        external
        view
        paperExists(contentHash)
        returns (uint256 totalEarnings, uint256 totalAccesses)
    {
        Paper storage p = papers[contentHash];
        return (p.totalEarnings, p.totalAccesses);
    }
}
