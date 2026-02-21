// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/BlindBidNativePaymaster.sol";
import "../src/BlindBidERC20Paymaster.sol";
import "../src/MockERC20.sol";
import "../src/BlindBidEscrow.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";

/**
 * @title DeployAll
 * @notice Deploys the full BlindBid contract suite to the ADI network.
 *
 * Usage:
 *   forge script script/Deploy.s.sol:DeployAll \
 *     --rpc-url http://127.0.0.1:8545 \
 *     --broadcast \
 *     --private-key $DEPLOYER_PRIVATE_KEY
 */
contract DeployAll is Script {
    // ADI testnet EntryPoint v0.7
    address constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    function run() external {
        address deployer = msg.sender;
        address sponsorSigner = vm.envAddress("SPONSOR_SIGNER_ADDRESS");

        vm.startBroadcast();

        // 1. Deploy MockERC20 (1 billion tokens, 18 decimals)
        MockERC20 mockToken = new MockERC20(
            "BlindBid Test Token",
            "BBTEST",
            18,
            1_000_000_000 ether
        );
        console.log("MockERC20 deployed at:", address(mockToken));

        // 2. Deploy Native Paymaster
        BlindBidNativePaymaster nativePaymaster = new BlindBidNativePaymaster(
            IEntryPoint(ENTRY_POINT),
            sponsorSigner
        );
        console.log("NativePaymaster deployed at:", address(nativePaymaster));

        // 3. Deploy ERC20 Paymaster
        //    tokenPricePerGas: 1e12 means 1e12 token-wei per gas unit
        //    = 0.000001 token per gas unit
        BlindBidERC20Paymaster erc20Paymaster = new BlindBidERC20Paymaster(
            IEntryPoint(ENTRY_POINT),
            sponsorSigner,
            IERC20(address(mockToken)),
            1e12
        );
        console.log("ERC20Paymaster deployed at:", address(erc20Paymaster));

        // 4. Deploy Escrow (deployer is owner + arbitrator initially)
        BlindBidEscrow escrow = new BlindBidEscrow(
            sponsorSigner,
            deployer
        );
        console.log("BlindBidEscrow deployed at:", address(escrow));

        // 5. Fund the Native Paymaster with 100 ADI for gas sponsorship
        nativePaymaster.deposit{value: 100 ether}();
        console.log("NativePaymaster deposit: 100 ADI");

        // 6. Fund the ERC20 Paymaster with 100 ADI for gas
        erc20Paymaster.deposit{value: 100 ether}();
        console.log("ERC20Paymaster deposit: 100 ADI");

        // 7. Stake both paymasters on EntryPoint (1 ADI, 86400s unstake delay)
        nativePaymaster.addStake{value: 1 ether}(86400);
        console.log("NativePaymaster staked: 1 ADI");

        erc20Paymaster.addStake{value: 1 ether}(86400);
        console.log("ERC20Paymaster staked: 1 ADI");

        vm.stopBroadcast();

        // Print summary
        console.log("\n=== DEPLOYMENT SUMMARY ===");
        console.log("Network chain ID:", block.chainid);
        console.log("Deployer:", deployer);
        console.log("Sponsor Signer:", sponsorSigner);
        console.log("EntryPoint v0.7:", ENTRY_POINT);
        console.log("MockERC20:", address(mockToken));
        console.log("NativePaymaster:", address(nativePaymaster));
        console.log("ERC20Paymaster:", address(erc20Paymaster));
        console.log("BlindBidEscrow:", address(escrow));
    }
}
