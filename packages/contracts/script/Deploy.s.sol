// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PaperRegistry} from "../src/PaperRegistry.sol";

contract Deploy is Script {
    function run() external {
        console.log("Deploying PaperRegistry...");
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast();

        PaperRegistry registry = new PaperRegistry();

        vm.stopBroadcast();

        console.log("PaperRegistry deployed at:", address(registry));
        console.log("Owner:", registry.owner());

        // Log for .env update
        console.log("");
        console.log("=== Add to your .env ===");
        console.log("PAPER_REGISTRY_ADDRESS=", address(registry));
    }
}
