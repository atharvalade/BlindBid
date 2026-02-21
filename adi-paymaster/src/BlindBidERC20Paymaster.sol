// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@account-abstraction/core/BasePaymaster.sol";
import "@account-abstraction/interfaces/PackedUserOperation.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title BlindBidERC20Paymaster
 * @notice ERC-4337 v0.7 paymaster that accepts ERC-20 tokens as gas payment.
 *
 * Flow:
 *   1. User approves this paymaster to spend their ERC-20 tokens.
 *   2. Backend signs sponsorship data (same as native paymaster).
 *   3. On postOp, the paymaster charges the user in ERC-20 tokens based on
 *      actual gas used × a configurable token/gas price.
 *
 * This demonstrates dual-mode gas payment: the paymaster fronts native gas,
 * then recoups in ERC-20 from the user.
 */
contract BlindBidERC20Paymaster is BasePaymaster {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using SafeERC20 for IERC20;
    using UserOperationLib for PackedUserOperation;

    /// @notice The ERC-20 token accepted for gas payment
    IERC20 public immutable token;

    /// @notice Price of 1 unit of gas in token wei (e.g. 1e12 means 1e12 token-wei per gas unit)
    uint256 public tokenPricePerGas;

    /// @notice The authorized off-chain sponsor signer
    address public sponsorSigner;

    /// @notice Accounting: total ERC-20 collected per sender
    mapping(address => uint256) public tokensPaid;

    event TokenPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event SponsorSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event GasPaidInToken(address indexed sender, uint256 tokenAmount, uint256 gasCost);

    constructor(
        IEntryPoint _entryPoint,
        address _sponsorSigner,
        IERC20 _token,
        uint256 _tokenPricePerGas
    ) BasePaymaster(_entryPoint) {
        require(address(_token) != address(0), "token cannot be zero");
        require(_sponsorSigner != address(0), "signer cannot be zero");
        require(_tokenPricePerGas > 0, "price must be > 0");

        sponsorSigner = _sponsorSigner;
        token = _token;
        tokenPricePerGas = _tokenPricePerGas;
    }

    function setSponsorSigner(address _newSigner) external onlyOwner {
        require(_newSigner != address(0), "signer cannot be zero");
        emit SponsorSignerUpdated(sponsorSigner, _newSigner);
        sponsorSigner = _newSigner;
    }

    function setTokenPrice(uint256 _newPrice) external onlyOwner {
        require(_newPrice > 0, "price must be > 0");
        emit TokenPriceUpdated(tokenPricePerGas, _newPrice);
        tokenPricePerGas = _newPrice;
    }

    /**
     * @notice Validate the paymasterAndData contains a valid sponsor signature.
     * Same signature scheme as NativePaymaster.
     *
     * Additionally checks that the sender has approved enough tokens.
     */
    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 /*userOpHash*/,
        uint256 maxCost
    ) internal view override returns (bytes memory context, uint256 validationData) {
        bytes calldata paymasterData = userOp.paymasterAndData[PAYMASTER_DATA_OFFSET:];
        (uint48 validUntil, uint48 validAfter, bytes memory signature) =
            abi.decode(paymasterData, (uint48, uint48, bytes));

        // Verify sponsor signature
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

        address recovered = hash.toEthSignedMessageHash().recover(signature);

        if (recovered != sponsorSigner) {
            return ("", _packValidationData(true, validUntil, validAfter));
        }

        // Check token allowance: estimate max token cost
        uint256 maxTokenCost = (maxCost * tokenPricePerGas) / 1e18;
        uint256 allowance = token.allowance(userOp.sender, address(this));
        if (allowance < maxTokenCost) {
            // Sig fail = 1 → tells EntryPoint "not approved"
            return ("", _packValidationData(true, validUntil, validAfter));
        }

        // Context: sender + maxTokenCost for postOp
        context = abi.encode(userOp.sender, maxTokenCost);
        validationData = _packValidationData(false, validUntil, validAfter);
    }

    /**
     * @notice Post-op: charge the sender in ERC-20 based on actual gas cost.
     */
    function _postOp(
        PostOpMode /*mode*/,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 /*actualUserOpFeePerGas*/
    ) internal override {
        (address sender, ) = abi.decode(context, (address, uint256));
        uint256 tokenCost = (actualGasCost * tokenPricePerGas) / 1e18;
        if (tokenCost > 0) {
            token.safeTransferFrom(sender, address(this), tokenCost);
            tokensPaid[sender] += tokenCost;
            emit GasPaidInToken(sender, tokenCost, actualGasCost);
        }
    }

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

    /// @notice Owner can withdraw collected ERC-20 tokens
    function withdrawTokens(address to, uint256 amount) external onlyOwner {
        token.safeTransfer(to, amount);
    }

    /// @notice View: get token payment info for a sender
    function getTokenPaymentInfo(address sender) external view returns (uint256) {
        return tokensPaid[sender];
    }

    receive() external payable {
        deposit();
    }
}
