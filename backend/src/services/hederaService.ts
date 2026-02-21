/**
 * HederaService — publishes and verifies audit commitments on Hedera Consensus
 * Service (HCS).
 *
 * At each critical auction stage we publish:
 *   hash(auctionId, stage, cantonTxId, adiTxHash, timestamp, nonce)
 *
 * The topic is public → anyone can verify the sequence and timing.
 * Nobody can reverse the hash into prices, delivery terms, or identities.
 */

import {
  Client,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicId,
  PrivateKey,
  TopicInfoQuery,
} from "@hashgraph/sdk";
import { ethers } from "ethers";
import { config } from "../config";
import type { AuditCommitment, AuditLogEntry, AuctionStage } from "../types";

// ─── In-memory log (swap for DB in prod) ─────────────────────────────────────
const auditLog: AuditLogEntry[] = [];

// ─── Topic cache ──────────────────────────────────────────────────────────────
// Maps auctionId → HCS topic ID string (e.g. "0.0.1234567")
const topicCache = new Map<string, string>();

// ─── Build Hedera client ──────────────────────────────────────────────────────
function buildClient(): Client | null {
  if (!config.hedera.privateKey) return null;

  const client =
    config.hedera.network === "mainnet"
      ? Client.forMainnet()
      : Client.forTestnet();

  client.setOperator(
    config.hedera.accountId,
    PrivateKey.fromStringECDSA(config.hedera.privateKey)
  );

  return client;
}

// ─── Build commitment hash ────────────────────────────────────────────────────
export function buildCommitmentHash(
  auctionId: string,
  stage: AuctionStage,
  cantonTxId: string,
  adiTxHash: string,
  timestamp: string,
  nonce: string
): string {
  return ethers.keccak256(
    ethers.toUtf8Bytes(
      JSON.stringify({ auctionId, stage, cantonTxId, adiTxHash, timestamp, nonce })
    )
  );
}

// ─── Get or create a per-auction HCS topic ────────────────────────────────────
export async function getOrCreateTopic(auctionId: string): Promise<string> {
  if (topicCache.has(auctionId)) {
    return topicCache.get(auctionId)!;
  }

  const client = buildClient();
  if (!client) {
    // No Hedera key yet — return a deterministic mock topic so the rest of
    // the flow still works during local development.
    const mock = `0.0.MOCK-${auctionId.slice(-6)}`;
    topicCache.set(auctionId, mock);
    return mock;
  }

  const tx = await new TopicCreateTransaction()
    .setTopicMemo(`BlindBid audit log: ${auctionId}`)
    .execute(client);

  const receipt = await tx.getReceipt(client);
  const topicId = receipt.topicId!.toString();
  topicCache.set(auctionId, topicId);
  client.close();
  return topicId;
}

// ─── Publish a commitment ─────────────────────────────────────────────────────
export async function publishCommitment(
  auctionId: string,
  stage: AuctionStage,
  cantonTxId = "CANTON-PENDING",
  adiTxHash = "ADI-PENDING"
): Promise<AuditLogEntry> {
  const timestamp = new Date().toISOString();
  const nonce = ethers.hexlify(ethers.randomBytes(16));
  const commitmentHash = buildCommitmentHash(
    auctionId,
    stage,
    cantonTxId,
    adiTxHash,
    timestamp,
    nonce
  );

  const commitment: AuditCommitment = {
    auctionId,
    stage,
    cantonTxId,
    adiTxHash,
    timestamp,
    nonce,
    commitmentHash,
  };

  const topicId = await getOrCreateTopic(auctionId);

  let sequenceNumber = auditLog.filter((e) => e.auctionId === auctionId).length + 1;
  let consensusTimestamp = timestamp;

  const client = buildClient();
  if (client) {
    try {
      const msg = await new TopicMessageSubmitTransaction()
        .setTopicId(TopicId.fromString(topicId))
        .setMessage(
          JSON.stringify({
            commitmentHash,
            stage,
            timestamp,
            // Only the hash is published — no bid data
          })
        )
        .execute(client);

      const receipt = await msg.getReceipt(client);
      sequenceNumber = Number(receipt.topicSequenceNumber ?? sequenceNumber);
      client.close();
    } catch (e) {
      // Don't fail the whole flow if HCS is down; log it
      console.warn("[HEDERA] HCS submission failed:", (e as Error).message);
    }
  } else {
    console.info("[HEDERA] No private key configured — commitment stored locally only");
  }

  const entry: AuditLogEntry = {
    ...commitment,
    hederaTopicId: topicId,
    hederaSequenceNumber: sequenceNumber,
    hederaConsensusTimestamp: consensusTimestamp,
  };

  auditLog.push(entry);
  return entry;
}

// ─── Retrieve audit log for an auction ────────────────────────────────────────
export function getAuditLog(auctionId: string): AuditLogEntry[] {
  return auditLog.filter((e) => e.auctionId === auctionId);
}

// ─── Verify a commitment locally ─────────────────────────────────────────────
export function verifyCommitment(entry: AuditLogEntry): boolean {
  const expected = buildCommitmentHash(
    entry.auctionId,
    entry.stage,
    entry.cantonTxId,
    entry.adiTxHash,
    entry.timestamp,
    entry.nonce
  );
  return expected === entry.commitmentHash;
}
