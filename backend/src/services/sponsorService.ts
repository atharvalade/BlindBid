/**
 * SponsorService — builds and signs paymasterAndData for ERC-4337 v0.7 UserOperations.
 *
 * Format of paymasterAndData (after the 20-byte paymaster address):
 *   [validUntil: uint48][validAfter: uint48][signature: bytes]
 *   = 6 + 6 + 65 = 77 bytes appended after address
 *
 * The paymaster contract calls this backend to obtain paymasterAndData before
 * forwarding the UserOp to the bundler.
 */

import { ethers } from "ethers";
import { config } from "../config";
import type { SponsorPolicy, SponsorshipData } from "../types";

// ─── Policy store (in-memory; swap for Redis/DB in prod) ─────────────────────
const policyStore = new Map<string, SponsorPolicy>();         // key = beneficiary address
const opsCounter = new Map<string, number>();                 // key = `${auctionId}:${beneficiary}`
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;                 // 1 hour
const rateLimitTimestamps = new Map<string, number[]>();      // key = beneficiary

// ─── Helpers ──────────────────────────────────────────────────────────────────

function opsKey(auctionId: string, beneficiary: string): string {
  return `${auctionId}:${beneficiary.toLowerCase()}`;
}

export function registerPolicy(policy: SponsorPolicy): void {
  const key = policy.beneficiary.toLowerCase();
  policyStore.set(key, policy);
  opsCounter.set(opsKey(policy.auctionId, key), 0);
}

// ─── Main signing function ────────────────────────────────────────────────────

export async function buildSponsorshipData(
  paymasterAddress: `0x${string}`,
  userOp: {
    sender: `0x${string}`;
    callData: `0x${string}`;
    auctionId: string;
  },
  validitySeconds = 300   // 5 minutes default
): Promise<SponsorshipData> {
  const signer = new ethers.Wallet(config.sponsorSigner.privateKey);
  const now = Math.floor(Date.now() / 1000);
  const validAfter = now - 30;          // small clock-skew tolerance
  const validUntil = now + validitySeconds;

  // ─── Abuse controls ────────────────────────────────────────────────────────

  const beneficiaryKey = userOp.sender.toLowerCase();
  const policy = policyStore.get(beneficiaryKey);

  if (!policy) {
    throw new Error(`SPONSOR_POLICY_NOT_FOUND: No sponsorship policy for ${userOp.sender}`);
  }

  // 1. Expiry check
  if (policy.expiresAt < now) {
    throw new Error(`SPONSOR_POLICY_EXPIRED: Policy expired at ${new Date(policy.expiresAt * 1000).toISOString()}`);
  }

  // 2. Auction ID match
  if (policy.auctionId !== userOp.auctionId) {
    throw new Error(`SPONSOR_AUCTION_MISMATCH: Policy is for auction ${policy.auctionId}, got ${userOp.auctionId}`);
  }

  // 3. Selector allowlist (first 4 bytes of callData)
  const selector = userOp.callData.slice(0, 10) as `0x${string}`;
  if (
    policy.allowedSelectors.length > 0 &&
    !policy.allowedSelectors.map((s) => s.toLowerCase()).includes(selector.toLowerCase())
  ) {
    throw new Error(`SPONSOR_SELECTOR_DISALLOWED: Selector ${selector} not in allowlist`);
  }

  // 4. Ops-per-auction rate limit
  const key = opsKey(policy.auctionId, beneficiaryKey);
  const currentOps = opsCounter.get(key) ?? 0;
  if (currentOps >= policy.maxOpsPerAuction) {
    throw new Error(
      `SPONSOR_RATE_LIMIT: Exceeded ${policy.maxOpsPerAuction} ops for auction ${policy.auctionId}`
    );
  }

  // 5. Per-hour rate limit (max 20 ops/hour globally per sender)
  const hourKey = beneficiaryKey;
  const stamps = (rateLimitTimestamps.get(hourKey) ?? []).filter(
    (t) => Date.now() - t < RATE_LIMIT_WINDOW_MS
  );
  if (stamps.length >= 20) {
    throw new Error(`SPONSOR_HOURLY_LIMIT: Sender exceeded 20 ops/hour`);
  }

  // ─── Build the hash the paymaster contract will verify ────────────────────
  //
  // keccak256(abi.encode(sender, validUntil, validAfter, paymasterAddress, chainId, entryPoint))
  //
  const chainId = (await new ethers.JsonRpcProvider(config.adi.rpcUrl).getNetwork()).chainId;

  const hash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint48", "uint48", "address", "uint256", "address"],
      [
        userOp.sender,
        validUntil,
        validAfter,
        paymasterAddress,
        chainId,
        config.adi.entryPointV07,
      ]
    )
  );

  // Sign the hash (EIP-191 personal sign so paymaster uses ECDSA.recover)
  const sig = await signer.signMessage(ethers.getBytes(hash));

  // ─── Encode paymasterData ─────────────────────────────────────────────────
  //   paymasterData = abi.encode(validUntil, validAfter, sig)
  const paymasterData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint48", "uint48", "bytes"],
    [validUntil, validAfter, sig]
  ) as `0x${string}`;

  // ─── Update counters ──────────────────────────────────────────────────────
  opsCounter.set(key, currentOps + 1);
  stamps.push(Date.now());
  rateLimitTimestamps.set(hourKey, stamps);

  return {
    paymasterAddress,
    paymasterData,
    validUntil,
    validAfter,
    sponsorSignature: sig as `0x${string}`,
  };
}

// ─── Failure-case test helpers (for demo) ────────────────────────────────────

export function buildExpiredSponsorshipData(
  paymasterAddress: `0x${string}`
): Partial<SponsorshipData> & { error: string } {
  return {
    paymasterAddress,
    validUntil: Math.floor(Date.now() / 1000) - 3600, // already expired
    error: "SPONSOR_POLICY_EXPIRED: demonstration of expired sponsorship",
  };
}

export function buildDisallowedSelectorData(
  paymasterAddress: `0x${string}`,
  badSelector: `0x${string}`
): { error: string } {
  return {
    error: `SPONSOR_SELECTOR_DISALLOWED: selector ${badSelector} is not in the allowlist`,
  };
}
