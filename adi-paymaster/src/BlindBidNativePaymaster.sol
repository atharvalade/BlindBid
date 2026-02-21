// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@account-abstraction/core/BasePaymaster.sol";
import "@account-abstraction/interfaces/PackedUserOperation.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title BlindBidNativePaymaster
 * @notice ERC-4337 v0.7 paymaster that sponsors gas with native ADI tokens.
 *
 * Sponsorship flow:
 *   1. Backend signs (sender, validUntil, validAfter, paymasterAddress, chainId, entryPoint)
 *   2. Bundler submits UserOp with paymasterAndData = address(this) ++ verificationGasLimit ++ postOpGasLimit ++ abi.encode(validUntil, validAfter, signature)
 *   3. This contract recovers the signer and checks it matches `sponsorSigner`.
 *
 * Abuse controls verified on-chain:
 *   - Time-bound: validUntil / validAfter
 *   - Signer authorization: only the registered sponsorSigner
 *   - Bound to this paymaster, entryPoint, chainId, and sender address
 */
contract BlindBidNativePaymaster is BasePaymaster {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using UserOperationLib for PackedUserOperation;

    /// @notice The authorized off-chain sponsor signer
    address public sponsorSigner;

    /// @notice Tracks total gas sponsored per sender (accounting)
    mapping(address => uint256) public sponsoredGas;

    /// @notice Tracks number of operations sponsored per sender
    mapping(address => uint256) public sponsoredOpsCount;

    event SponsorSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event GasSponsored(address indexed sender, uint256 gasCost, uint256 totalSponsored);

    error InvalidSignature();
    error SignerMismatch(address recovered, address expected);

    constructor(
        IEntryPoint _entryPoint,
        address _sponsorSigner
    ) BasePaymaster(_entryPoint) {
        require(_sponsorSigner != address(0), "signer cannot be zero");
        sponsorSigner = _sponsorSigner;
    }

    /// @notice Owner can rotate the sponsor signer
    function setSponsorSigner(address _newSigner) external onlyOwner {
        require(_newSigner != address(0), "signer cannot be zero");
        emit SponsorSignerUpdated(sponsorSigner, _newSigner);
        sponsorSigner = _newSigner;
    }

    /**
     * @notice Validate the paymasterAndData contains a valid sponsor signature.
     *
     * paymasterData layout (after the 20-byte address + gas fields extracted by EP):
     *   abi.encode(uint48 validUntil, uint48 validAfter, bytes signature)
     */
    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 /*userOpHash*/,
        uint256 /*maxCost*/
    ) internal view override returns (bytes memory context, uint256 validationData) {
        // Decode paymasterData (everything after PAYMASTER_DATA_OFFSET)
        bytes calldata paymasterData = userOp.paymasterAndData[PAYMASTER_DATA_OFFSET:];
        (uint48 validUntil, uint48 validAfter, bytes memory signature) =
            abi.decode(paymasterData, (uint48, uint48, bytes));

        // Build the hash the backend signed
        bytes32 hash = keccak256(
            abi.encode(
                userOp.sender,
                validUntil,
                validAfter,
                address(this),
                block.chainid,
                address(entryPoint)
            )
        );

        // Recover signer from EIP-191 personal sign
        address recovered = hash.toEthSignedMessageHash().recover(signature);

        if (recovered != sponsorSigner) {
            // Return SIG_VALIDATION_FAILED = 1 (packed into validationData)
            return ("", _packValidationData(true, validUntil, validAfter));
        }

        // Return context = sender address (for postOp accounting)
        context = abi.encode(userOp.sender);
        validationData = _packValidationData(false, validUntil, validAfter);
    }

    /**
     * @notice Post-operation: track gas usage for accounting.
     */
    function _postOp(
        PostOpMode /*mode*/,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 /*actualUserOpFeePerGas*/
    ) internal override {
        address sender = abi.decode(context, (address));
        sponsoredGas[sender] += actualGasCost;
        sponsoredOpsCount[sender] += 1;
        emit GasSponsored(sender, actualGasCost, sponsoredGas[sender]);
    }

    /**
     * @notice Pack validationData per ERC-4337 spec.
     * Layout: [20-byte sigFailed] [6-byte validUntil] [6-byte validAfter]
     */
    function _packValidationData(
        bool sigFailed,
        uint48 validUntil,
        uint48 validAfter
    ) internal pure returns (uint256) {
        return
            (sigFailed ? 1 : 0) |
            (uint256(validUntil) << 160) |
            (uint256(validAfter) << (160 + 48));
    }

    /// @notice View: get accounting for a sender
    function getSponsorshipInfo(address sender)
        external
        view
        returns (uint256 totalGas, uint256 opsCount)
    {
        return (sponsoredGas[sender], sponsoredOpsCount[sender]);
    }

    /// @notice Accept native token deposits for funding gas sponsorship
    receive() external payable {
        deposit();
    }
}
