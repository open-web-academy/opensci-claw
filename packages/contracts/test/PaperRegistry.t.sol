// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {PaperRegistry} from "../src/PaperRegistry.sol";

contract PaperRegistryTest is Test {
    PaperRegistry public registry;

    address public owner;
    address public author1;
    address public author2;

    bytes32 public testHash = keccak256("test-paper-content");
    string public testMetadataURI = "ipfs://QmTest123";

    uint256 public PRICE_PER_QUERY = 10_000;  // $0.01 USDC
    uint256 public PRICE_PER_FULL  = 100_000; // $0.10 USDC
    uint256 public TRAINING_PRICE  = 5_000_000_000; // $5000 USDC

    function setUp() public {
        owner   = address(this);
        author1 = makeAddr("author1");
        author2 = makeAddr("author2");

        registry = new PaperRegistry();
    }

    // ── Register ──────────────────────────────────────────────────────────────

    function test_RegisterPaper() public {
        vm.prank(author1);
        registry.registerPaper(testHash, testMetadataURI, PRICE_PER_QUERY, PRICE_PER_FULL, TRAINING_PRICE);

        assertTrue(registry.exists(testHash));
        PaperRegistry.Paper memory p = registry.getPaper(testHash);

        assertEq(p.author, author1);
        assertEq(p.pricePerQuery, PRICE_PER_QUERY);
        assertEq(p.pricePerFull, PRICE_PER_FULL);
        assertEq(p.trainingPrice, TRAINING_PRICE);
        assertEq(p.metadataURI, testMetadataURI);
        assertEq(p.totalEarnings, 0);
        assertEq(p.totalAccesses, 0);
        assertTrue(p.active);
    }

    function test_RegisterPaper_EmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit PaperRegistry.PaperRegistered(
            testHash, author1, testMetadataURI, PRICE_PER_QUERY, PRICE_PER_FULL, block.timestamp
        );

        vm.prank(author1);
        registry.registerPaper(testHash, testMetadataURI, PRICE_PER_QUERY, PRICE_PER_FULL, TRAINING_PRICE);
    }

    function test_RegisterPaper_RevertIfDuplicate() public {
        vm.startPrank(author1);
        registry.registerPaper(testHash, testMetadataURI, PRICE_PER_QUERY, PRICE_PER_FULL, TRAINING_PRICE);

        vm.expectRevert("PaperRegistry: paper already registered");
        registry.registerPaper(testHash, testMetadataURI, PRICE_PER_QUERY, PRICE_PER_FULL, TRAINING_PRICE);
        vm.stopPrank();
    }

    function test_RegisterPaper_RevertIfZeroPrice() public {
        vm.prank(author1);
        vm.expectRevert("PaperRegistry: query price must be > 0");
        registry.registerPaper(testHash, testMetadataURI, 0, PRICE_PER_FULL, TRAINING_PRICE);
    }

    function test_GetAuthorPapers() public {
        bytes32 hash2 = keccak256("second-paper");

        vm.startPrank(author1);
        registry.registerPaper(testHash, testMetadataURI, PRICE_PER_QUERY, PRICE_PER_FULL, TRAINING_PRICE);
        registry.registerPaper(hash2, "ipfs://QmTest456", PRICE_PER_QUERY, PRICE_PER_FULL, TRAINING_PRICE);
        vm.stopPrank();

        bytes32[] memory papers = registry.getAuthorPapers(author1);
        assertEq(papers.length, 2);
        assertEq(papers[0], testHash);
        assertEq(papers[1], hash2);
    }

    // ── Record Access ─────────────────────────────────────────────────────────

    function test_RecordAccess() public {
        vm.prank(author1);
        registry.registerPaper(testHash, testMetadataURI, PRICE_PER_QUERY, PRICE_PER_FULL, TRAINING_PRICE);

        // owner == address(this) == registry.owner()
        registry.recordAccess(testHash, "query", PRICE_PER_QUERY);

        PaperRegistry.Paper memory p = registry.getPaper(testHash);
        assertEq(p.totalEarnings, PRICE_PER_QUERY);
        assertEq(p.totalAccesses, 1);
    }

    function test_RecordAccess_RevertIfNotOwner() public {
        vm.prank(author1);
        registry.registerPaper(testHash, testMetadataURI, PRICE_PER_QUERY, PRICE_PER_FULL, TRAINING_PRICE);

        vm.prank(author2);
        vm.expectRevert("PaperRegistry: not owner");
        registry.recordAccess(testHash, "query", PRICE_PER_QUERY);
    }

    function test_RecordAccess_AccumulatesEarnings() public {
        vm.prank(author1);
        registry.registerPaper(testHash, testMetadataURI, PRICE_PER_QUERY, PRICE_PER_FULL, TRAINING_PRICE);

        registry.recordAccess(testHash, "query", PRICE_PER_QUERY);
        registry.recordAccess(testHash, "query", PRICE_PER_QUERY);
        registry.recordAccess(testHash, "full",  PRICE_PER_FULL);

        (uint256 totalEarnings, uint256 totalAccesses) = registry.getPaperStats(testHash);
        assertEq(totalEarnings, 2 * PRICE_PER_QUERY + PRICE_PER_FULL);
        assertEq(totalAccesses, 3);
    }

    // ── Update Pricing ────────────────────────────────────────────────────────

    function test_UpdatePricing() public {
        vm.startPrank(author1);
        registry.registerPaper(testHash, testMetadataURI, PRICE_PER_QUERY, PRICE_PER_FULL, TRAINING_PRICE);
        registry.updatePricing(testHash, 20_000, 200_000, TRAINING_PRICE);
        vm.stopPrank();

        PaperRegistry.Paper memory p = registry.getPaper(testHash);
        assertEq(p.pricePerQuery, 20_000);
        assertEq(p.pricePerFull, 200_000);
    }

    function test_UpdatePricing_RevertIfNotAuthor() public {
        vm.prank(author1);
        registry.registerPaper(testHash, testMetadataURI, PRICE_PER_QUERY, PRICE_PER_FULL, TRAINING_PRICE);

        vm.prank(author2);
        vm.expectRevert("PaperRegistry: not author");
        registry.updatePricing(testHash, 20_000, 200_000, TRAINING_PRICE);
    }

    // ── Deactivate / Reactivate ───────────────────────────────────────────────

    function test_DeactivatePaper() public {
        vm.startPrank(author1);
        registry.registerPaper(testHash, testMetadataURI, PRICE_PER_QUERY, PRICE_PER_FULL, TRAINING_PRICE);
        registry.deactivatePaper(testHash);
        vm.stopPrank();

        assertFalse(registry.isPaperActive(testHash));
    }

    function test_ReactivatePaper() public {
        vm.startPrank(author1);
        registry.registerPaper(testHash, testMetadataURI, PRICE_PER_QUERY, PRICE_PER_FULL, TRAINING_PRICE);
        registry.deactivatePaper(testHash);
        registry.reactivatePaper(testHash);
        vm.stopPrank();

        assertTrue(registry.isPaperActive(testHash));
    }

    function test_RecordAccess_RevertIfInactive() public {
        vm.prank(author1);
        registry.registerPaper(testHash, testMetadataURI, PRICE_PER_QUERY, PRICE_PER_FULL, TRAINING_PRICE);

        vm.prank(author1);
        registry.deactivatePaper(testHash);

        vm.expectRevert("PaperRegistry: paper not active");
        registry.recordAccess(testHash, "query", PRICE_PER_QUERY);
    }
}
