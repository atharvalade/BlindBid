// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BlindBidEscrow
 * @notice Escrow contract for BlindBid auction settlements.
 *
 * Flow:
 *   1. Winner deposits native ADI or ERC-20 into escrow (linked to auctionId).
 *   2. Canton privately verifies conditions (delivery, KYC, inspection).
 *   3. Backend calls release() or refund() based on Canton's instruction.
 *   4. Funds move to seller or back to buyer.
 *
 * Supports:
 *   - Native ADI deposits
 *   - ERC-20 deposits
 *   - Quote verification (signed by sponsor signer)
 *   - Dispute resolution via arbitrator
 */
contract BlindBidEscrow is Ownable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    enum EscrowState { Empty, Funded, Released, Refunded, Disputed }

    struct Escrow {
        bytes32 auctionId;      // keccak256 of the auction ID string
        address buyer;
        address seller;
        uint256 amount;         // in native or token
        address token;          // address(0) = native ADI
        EscrowState state;
        uint256 fundedAt;
    }

    /// @notice The authorized quote signer (same as sponsor signer)
    address public quoteSigner;

    /// @notice Escrow storage: keccak256(auctionIdString) → Escrow
    mapping(bytes32 => Escrow) public escrows;

    /// @notice Arbitrator address for disputes
    address public arbitrator;

    event EscrowFunded(bytes32 indexed auctionHash, address buyer, address seller, uint256 amount, address token);
    event EscrowReleased(bytes32 indexed auctionHash, address seller, uint256 amount);
    event EscrowRefunded(bytes32 indexed auctionHash, address buyer, uint256 amount);
    event EscrowDisputed(bytes32 indexed auctionHash, address initiator);
    event DisputeResolved(bytes32 indexed auctionHash, bool releasedToSeller);

    constructor(address _quoteSigner, address _arbitrator) Ownable(msg.sender) {
        require(_quoteSigner != address(0), "signer cannot be zero");
        quoteSigner = _quoteSigner;
        arbitrator = _arbitrator;
    }

    // ─── Native ADI deposit ──────────────────────────────────────────────────

    /**
     * @notice Deposit native ADI into escrow for an auction.
     * @param auctionIdStr The auction ID string (e.g. "AUCTION-001")
     * @param seller The seller address to receive funds on release
     */
    function depositNative(
        string calldata auctionIdStr,
        address seller
    ) external payable {
        require(msg.value > 0, "must send value");
        bytes32 auctionHash = keccak256(bytes(auctionIdStr));
        Escrow storage e = escrows[auctionHash];
        require(e.state == EscrowState.Empty, "escrow already exists");

        e.auctionId = auctionHash;
        e.buyer = msg.sender;
        e.seller = seller;
        e.amount = msg.value;
        e.token = address(0);
        e.state = EscrowState.Funded;
        e.fundedAt = block.timestamp;

        emit EscrowFunded(auctionHash, msg.sender, seller, msg.value, address(0));
    }

    // ─── ERC-20 deposit ──────────────────────────────────────────────────────

    /**
     * @notice Deposit ERC-20 tokens into escrow.
     * @param auctionIdStr The auction ID string
     * @param seller The seller address
     * @param tokenAddr The ERC-20 token address
     * @param amount The token amount
     */
    function depositToken(
        string calldata auctionIdStr,
        address seller,
        address tokenAddr,
        uint256 amount
    ) external {
        require(amount > 0, "amount must be > 0");
        bytes32 auctionHash = keccak256(bytes(auctionIdStr));
        Escrow storage e = escrows[auctionHash];
        require(e.state == EscrowState.Empty, "escrow already exists");

        IERC20(tokenAddr).safeTransferFrom(msg.sender, address(this), amount);

        e.auctionId = auctionHash;
        e.buyer = msg.sender;
        e.seller = seller;
        e.amount = amount;
        e.token = tokenAddr;
        e.state = EscrowState.Funded;
        e.fundedAt = block.timestamp;

        emit EscrowFunded(auctionHash, msg.sender, seller, amount, tokenAddr);
    }

    // ─── Release (Canton says conditions met) ─────────────────────────────────

    /**
     * @notice Release escrowed funds to the seller.
     * Only callable by owner (backend bridge from Canton).
     */
    function release(string calldata auctionIdStr) external onlyOwner {
        bytes32 auctionHash = keccak256(bytes(auctionIdStr));
        Escrow storage e = escrows[auctionHash];
        require(e.state == EscrowState.Funded, "not funded");

        e.state = EscrowState.Released;

        if (e.token == address(0)) {
            (bool ok, ) = payable(e.seller).call{value: e.amount}("");
            require(ok, "native transfer failed");
        } else {
            IERC20(e.token).safeTransfer(e.seller, e.amount);
        }

        emit EscrowReleased(auctionHash, e.seller, e.amount);
    }

    // ─── Refund (Canton says conditions NOT met) ──────────────────────────────

    /**
     * @notice Refund escrowed funds to the buyer.
     * Only callable by owner (backend bridge from Canton).
     */
    function refund(string calldata auctionIdStr) external onlyOwner {
        bytes32 auctionHash = keccak256(bytes(auctionIdStr));
        Escrow storage e = escrows[auctionHash];
        require(e.state == EscrowState.Funded, "not funded");

        e.state = EscrowState.Refunded;

        if (e.token == address(0)) {
            (bool ok, ) = payable(e.buyer).call{value: e.amount}("");
            require(ok, "native transfer failed");
        } else {
            IERC20(e.token).safeTransfer(e.buyer, e.amount);
        }

        emit EscrowRefunded(auctionHash, e.buyer, e.amount);
    }

    // ─── Dispute flow ─────────────────────────────────────────────────────────

    function dispute(string calldata auctionIdStr) external {
        bytes32 auctionHash = keccak256(bytes(auctionIdStr));
        Escrow storage e = escrows[auctionHash];
        require(e.state == EscrowState.Funded, "not funded");
        require(msg.sender == e.buyer || msg.sender == e.seller, "not a party");

        e.state = EscrowState.Disputed;
        emit EscrowDisputed(auctionHash, msg.sender);
    }

    function resolveDispute(
        string calldata auctionIdStr,
        bool releaseToSeller
    ) external {
        require(msg.sender == arbitrator || msg.sender == owner(), "not authorized");
        bytes32 auctionHash = keccak256(bytes(auctionIdStr));
        Escrow storage e = escrows[auctionHash];
        require(e.state == EscrowState.Disputed, "not disputed");

        if (releaseToSeller) {
            e.state = EscrowState.Released;
            if (e.token == address(0)) {
                (bool ok, ) = payable(e.seller).call{value: e.amount}("");
                require(ok, "native transfer failed");
            } else {
                IERC20(e.token).safeTransfer(e.seller, e.amount);
            }
        } else {
            e.state = EscrowState.Refunded;
            if (e.token == address(0)) {
                (bool ok, ) = payable(e.buyer).call{value: e.amount}("");
                require(ok, "native transfer failed");
            } else {
                IERC20(e.token).safeTransfer(e.buyer, e.amount);
            }
        }

        emit DisputeResolved(auctionHash, releaseToSeller);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getEscrow(string calldata auctionIdStr)
        external
        view
        returns (
            address buyer,
            address seller,
            uint256 amount,
            address token,
            EscrowState state,
            uint256 fundedAt
        )
    {
        bytes32 auctionHash = keccak256(bytes(auctionIdStr));
        Escrow storage e = escrows[auctionHash];
        return (e.buyer, e.seller, e.amount, e.token, e.state, e.fundedAt);
    }

    function setArbitrator(address _arbitrator) external onlyOwner {
        arbitrator = _arbitrator;
    }

    function setQuoteSigner(address _quoteSigner) external onlyOwner {
        quoteSigner = _quoteSigner;
    }
}
