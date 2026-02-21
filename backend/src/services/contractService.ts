/**
 * Contract Interaction Service
 *
 * Provides typed access to all deployed BlindBid contracts:
 *   - NativePaymaster
 *   - ERC20Paymaster
 *   - MockERC20
 *   - BlindBidEscrow
 *
 * All reads go through the Anvil fork RPC.
 * All writes go through the deployer wallet.
 */

import { ethers } from "ethers";
import { config } from "../config";

// ─── ABIs ────────────────────────────────────────────────────────────────────

const NATIVE_PAYMASTER_ABI = [
  "function sponsorSigner() view returns (address)",
  "function getDeposit() view returns (uint256)",
  "function sponsoredGas(address) view returns (uint256)",
  "function sponsoredOpsCount(address) view returns (uint256)",
  "function getSponsorshipInfo(address) view returns (uint256, uint256)",
  "function owner() view returns (address)",
  "function deposit() payable",
  "function setSponsorSigner(address)",
];

const ERC20_PAYMASTER_ABI = [
  ...NATIVE_PAYMASTER_ABI,
  "function token() view returns (address)",
  "function tokenPricePerGas() view returns (uint256)",
  "function tokensPaid(address) view returns (uint256)",
  "function getTokenPaymentInfo(address) view returns (uint256)",
  "function setTokenPrice(uint256)",
  "function withdrawTokens(address, uint256)",
];

const MOCK_ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function mint(address, uint256)",
  "function approve(address, uint256) returns (bool)",
  "function transfer(address, uint256) returns (bool)",
  "function allowance(address, address) view returns (uint256)",
];

const ESCROW_ABI = [
  "function depositNative(string, address) payable",
  "function depositToken(string, address, address, uint256)",
  "function release(string)",
  "function refund(string)",
  "function dispute(string)",
  "function resolveDispute(string calldata, bool)",
  "function getEscrow(string) view returns (address, address, uint256, address, uint8, uint256)",
  "function quoteSigner() view returns (address)",
  "function arbitrator() view returns (address)",
];

const ENTRYPOINT_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function getNonce(address, uint192) view returns (uint256)",
  "function handleOps(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] ops, address beneficiary)",
];

// ─── Provider / Signers ──────────────────────────────────────────────────────

let provider: ethers.JsonRpcProvider;
let deployerWallet: ethers.Wallet;
let sponsorWallet: ethers.Wallet;

function getProvider(): ethers.JsonRpcProvider {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(config.adi.rpcUrl);
  }
  return provider;
}

function getDeployer(): ethers.Wallet {
  if (!deployerWallet) {
    deployerWallet = new ethers.Wallet(config.deployer.privateKey, getProvider());
  }
  return deployerWallet;
}

function getSponsorSigner(): ethers.Wallet {
  if (!sponsorWallet) {
    sponsorWallet = new ethers.Wallet(config.sponsorSigner.privateKey, getProvider());
  }
  return sponsorWallet;
}

// ─── Contract instances ──────────────────────────────────────────────────────

export function getNativePaymaster() {
  return new ethers.Contract(
    config.contracts.nativePaymaster,
    NATIVE_PAYMASTER_ABI,
    getDeployer()
  );
}

export function getERC20Paymaster() {
  return new ethers.Contract(
    config.contracts.erc20Paymaster,
    ERC20_PAYMASTER_ABI,
    getDeployer()
  );
}

export function getMockERC20() {
  return new ethers.Contract(
    config.contracts.mockErc20,
    MOCK_ERC20_ABI,
    getDeployer()
  );
}

export function getEscrow() {
  return new ethers.Contract(
    config.contracts.escrow,
    ESCROW_ABI,
    getDeployer()
  );
}

export function getEntryPoint() {
  return new ethers.Contract(
    config.adi.entryPointV07,
    ENTRYPOINT_ABI,
    getDeployer()
  );
}

// ─── Sponsor signature generation ─────────────────────────────────────────────

/**
 * Generate a sponsor signature for a UserOperation.
 * This is the off-chain authorization that allows a paymaster to sponsor gas.
 *
 * @param sender - The smart account address (or bidder address)
 * @param paymasterAddress - Which paymaster to use (native or erc20)
 * @param validUntil - Expiry timestamp (epoch seconds)
 * @param validAfter - Earliest valid timestamp (epoch seconds)
 */
export async function signSponsorAuthorization(
  sender: string,
  paymasterAddress: string,
  validUntil: number,
  validAfter: number
): Promise<{
  signature: string;
  validUntil: number;
  validAfter: number;
  paymasterAddress: string;
  sponsorSigner: string;
}> {
  const sponsor = getSponsorSigner();
  const chainId = (await getProvider().getNetwork()).chainId;

  // Build the hash matching what the paymaster contract expects
  const hash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint48", "uint48", "address", "uint256", "address"],
      [sender, validUntil, validAfter, paymasterAddress, chainId, config.adi.entryPointV07]
    )
  );

  // Sign with EIP-191 personal sign
  const signature = await sponsor.signMessage(ethers.getBytes(hash));

  return {
    signature,
    validUntil,
    validAfter,
    paymasterAddress,
    sponsorSigner: sponsor.address,
  };
}

/**
 * Build the full paymasterAndData bytes for a UserOperation.
 */
export function buildPaymasterAndData(
  paymasterAddress: string,
  validUntil: number,
  validAfter: number,
  signature: string,
  verificationGasLimit: number = 300_000,
  postOpGasLimit: number = 100_000
): string {
  const validationGasHex = ethers.zeroPadValue(ethers.toBeHex(verificationGasLimit), 16);
  const postOpGasHex = ethers.zeroPadValue(ethers.toBeHex(postOpGasLimit), 16);

  const paymasterData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint48", "uint48", "bytes"],
    [validUntil, validAfter, signature]
  );

  // paymasterAndData = paymaster(20) + verificationGasLimit(16) + postOpGasLimit(16) + paymasterData
  return ethers.concat([
    paymasterAddress,
    validationGasHex,
    postOpGasHex,
    paymasterData,
  ]);
}

// ─── View helpers ────────────────────────────────────────────────────────────

export async function getPaymasterInfo() {
  const p = getProvider();
  const nativePM = getNativePaymaster();
  const erc20PM = getERC20Paymaster();
  const ep = getEntryPoint();

  const [
    nativeSigner,
    nativeDeposit,
    erc20Signer,
    erc20Deposit,
    erc20Token,
    erc20Price,
  ] = await Promise.all([
    nativePM.sponsorSigner(),
    ep.balanceOf(config.contracts.nativePaymaster),
    erc20PM.sponsorSigner(),
    ep.balanceOf(config.contracts.erc20Paymaster),
    erc20PM.token(),
    erc20PM.tokenPricePerGas(),
  ]);

  return {
    native: {
      address: config.contracts.nativePaymaster,
      sponsorSigner: nativeSigner,
      depositOnEntryPoint: ethers.formatEther(nativeDeposit),
    },
    erc20: {
      address: config.contracts.erc20Paymaster,
      sponsorSigner: erc20Signer,
      depositOnEntryPoint: ethers.formatEther(erc20Deposit),
      token: erc20Token,
      tokenPricePerGas: erc20Price.toString(),
    },
    entryPoint: config.adi.entryPointV07,
    chainId: (await p.getNetwork()).chainId.toString(),
  };
}

export async function getEscrowInfo(auctionId: string) {
  const escrow = getEscrow();
  const [buyer, seller, amount, token, state, fundedAt] =
    await escrow.getEscrow(auctionId);

  const states = ["Empty", "Funded", "Released", "Refunded", "Disputed"];

  return {
    auctionId,
    buyer,
    seller,
    amount: ethers.formatEther(amount),
    token: token === ethers.ZeroAddress ? "NATIVE_ADI" : token,
    state: states[Number(state)] || "Unknown",
    fundedAt: Number(fundedAt),
  };
}

export { getProvider, getDeployer, getSponsorSigner };
