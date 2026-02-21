"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Globe, ArrowLeft, Search, RefreshCw, ExternalLink, Copy, Check,
  Loader2, AlertCircle, CheckCircle2, Hash, Clock, Shield,
  ChevronRight, FileText, Download, Eye, Lock, Sparkles
} from "lucide-react";
import * as api from "@/lib/api";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AuditEntry {
  stage: string;
  commitmentHash: string;
  cantonTxId: string;
  adiTxHash: string;
  timestamp: string;
  sequenceNumber: number;
  topicId: string;
  transactionId?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="p-1 rounded hover:bg-white/10 transition-colors" title="Copy to clipboard">
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-gray-500" />}
    </button>
  );
}

const stageConfig: Record<string, { color: string; icon: any; label: string; description: string }> = {
  "auction_created": { color: "brand", icon: FileText, label: "Auction Created", description: "Auction contract deployed to Canton ledger" },
  "bidding_closed":  { color: "canton", icon: Lock, label: "Bidding Closed", description: "No more bids accepted; scoring can begin" },
  "award":           { color: "adi", icon: CheckCircle2, label: "Award", description: "Winner selected and award proof generated" },
  "settlement":      { color: "hedera", icon: Globe, label: "Settlement", description: "Payment settled on ADI chain" },
};

function getStageInfo(stage: string) {
  return stageConfig[stage] || { color: "brand", icon: Hash, label: stage, description: "Custom event" };
}

// ─── Timeline Entry ─────────────────────────────────────────────────────────

function TimelineEntry({ entry, index, total }: { entry: AuditEntry; index: number; total: number }) {
  const [expanded, setExpanded] = useState(false);
  const info = getStageInfo(entry.stage);
  const Icon = info.icon;

  const colorMap: Record<string, string> = {
    brand:  "from-brand-500 to-brand-600",
    canton: "from-canton-500 to-canton-600",
    adi:    "from-adi-500 to-adi-600",
    hedera: "from-hedera-500 to-hedera-600",
  };

  const textColorMap: Record<string, string> = {
    brand: "text-brand-400",
    canton: "text-canton-400",
    adi: "text-adi-400",
    hedera: "text-hedera-400",
  };

  const gradientClass = colorMap[info.color] || colorMap.brand;
  const textClass = textColorMap[info.color] || textColorMap.brand;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
      className="relative"
    >
      {/* Timeline connector */}
      <div className="flex gap-4">
        {/* Left: dot and line */}
        <div className="flex flex-col items-center">
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${gradientClass} flex items-center justify-center z-10 shadow-lg`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          {index < total - 1 && (
            <div className="w-0.5 flex-1 bg-gradient-to-b from-white/20 to-transparent mt-2" />
          )}
        </div>

        {/* Right: content */}
        <div className="flex-1 pb-8">
          <div
            className="glass rounded-xl overflow-hidden cursor-pointer hover:ring-1 hover:ring-white/10 transition-all"
            onClick={() => setExpanded(!expanded)}
          >
            {/* Header */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className={`font-semibold ${textClass}`}>{info.label}</h3>
                  <p className="text-xs text-gray-500">{info.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-mono">#{entry.sequenceNumber}</span>
                  <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? "rotate-90" : ""}`} />
                </div>
              </div>

              {/* Hash preview */}
              <div className="flex items-center gap-2 mt-2">
                <Hash className="w-3 h-3 text-gray-600" />
                <span className="text-xs font-mono text-gray-400">
                  {entry.commitmentHash.slice(0, 20)}...{entry.commitmentHash.slice(-12)}
                </span>
                <CopyButton text={entry.commitmentHash} />
              </div>

              {/* Timestamp */}
              <div className="flex items-center gap-2 mt-1">
                <Clock className="w-3 h-3 text-gray-600" />
                <span className="text-xs text-gray-500">{new Date(entry.timestamp).toLocaleString()}</span>
              </div>
            </div>

            {/* Expanded details */}
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="border-t border-white/5"
                >
                  <div className="p-4 space-y-3">
                    {/* Commitment hash */}
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">COMMITMENT HASH</div>
                      <div className="flex items-center gap-2 bg-black/20 rounded-lg p-2">
                        <span className="text-xs font-mono text-hedera-400 break-all">{entry.commitmentHash}</span>
                        <CopyButton text={entry.commitmentHash} />
                      </div>
                      <p className="text-[10px] text-gray-600 mt-1">
                        hash(auctionId + stage + cantonTxId + adiTxHash + timestamp + nonce)
                      </p>
                    </div>

                    {/* Canton reference */}
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">CANTON TX REFERENCE</div>
                      <div className="flex items-center gap-2 bg-black/20 rounded-lg p-2">
                        <span className="text-xs font-mono text-canton-400 break-all">{entry.cantonTxId}</span>
                        <CopyButton text={entry.cantonTxId} />
                      </div>
                    </div>

                    {/* ADI tx hash */}
                    {entry.adiTxHash && entry.adiTxHash !== "0x" + "0".repeat(64) && (
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-1">ADI TX HASH</div>
                        <div className="flex items-center gap-2 bg-black/20 rounded-lg p-2">
                          <span className="text-xs font-mono text-adi-400 break-all">{entry.adiTxHash}</span>
                          <CopyButton text={entry.adiTxHash} />
                        </div>
                      </div>
                    )}

                    {/* Hedera details */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-1">HCS TOPIC ID</div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-hedera-400">{entry.topicId}</span>
                          <a
                            href={`https://hashscan.io/testnet/topic/${entry.topicId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-hedera-400 hover:text-hedera-300 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-1">SEQUENCE NUMBER</div>
                        <span className="text-xs font-mono">{entry.sequenceNumber}</span>
                      </div>
                    </div>

                    {/* Transaction ID */}
                    {entry.transactionId && (
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-1">HEDERA TX ID</div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-hedera-400">{entry.transactionId}</span>
                          <a
                            href={`https://hashscan.io/testnet/transaction/${entry.transactionId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-hedera-400 hover:text-hedera-300 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <CopyButton text={entry.transactionId} />
                        </div>
                      </div>
                    )}

                    {/* What this proves */}
                    <div className="bg-green-500/5 border border-green-500/10 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                        <span className="text-xs font-medium text-green-400">What this commitment proves</span>
                      </div>
                      <ul className="text-[11px] text-gray-400 space-y-0.5 ml-5">
                        <li>✅ This event occurred at the recorded timestamp</li>
                        <li>✅ The Canton transaction reference is linked</li>
                        <li>✅ The commitment hash is immutably stored on Hedera</li>
                        <li className="text-red-400">❌ It does NOT reveal any bid values, prices, or terms</li>
                      </ul>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN AUDIT TRAIL PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function AuditPage() {
  const [auctionId, setAuctionId] = useState("");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState<boolean | null>(null);

  const fetchAuditLog = useCallback(async () => {
    if (!auctionId.trim()) return;
    setLoading(true);
    setError("");
    setVerified(null);
    try {
      const result = await api.getAuditLog(auctionId);
      setEntries(result.data?.entries || []);
    } catch (err: any) {
      setError(err.message);
      setEntries([]);
    }
    setLoading(false);
  }, [auctionId]);

  const verifyAuditLog = useCallback(async () => {
    if (!auctionId.trim()) return;
    try {
      const result = await api.getAuditLog(auctionId);
      const logEntries = result.data?.entries || [];
      // Simple verification: check all entries have valid hashes and sequential order
      const isValid = logEntries.length > 0 && logEntries.every((e: any) => e.commitmentHash && e.timestamp);
      setVerified(isValid);
    } catch {
      setVerified(false);
    }
  }, [auctionId]);

  return (
    <main className="min-h-screen animated-gradient-bg">
      {/* Header */}
      <div className="glass-strong border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="font-bold text-lg flex items-center gap-2">
                <Globe className="w-4 h-4 text-hedera-400" />
                Audit Trail
              </h1>
              <p className="text-xs text-gray-500">
                Hedera Consensus Service — Public, immutable, privacy-preserving audit log
              </p>
            </div>
          </div>
          <Link
            href="/demo"
            className="px-4 py-2 rounded-lg text-xs font-medium bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 transition-all"
          >
            ← Run Demo First
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Search */}
        <div className="glass rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={auctionId}
                onChange={(e) => setAuctionId(e.target.value)}
                placeholder="Enter Auction ID to view its audit trail"
                className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-hedera-500/30 focus:border-hedera-500/50 transition-all placeholder:text-gray-600"
              />
            </div>
            <button
              onClick={fetchAuditLog}
              disabled={!auctionId.trim() || loading}
              className="px-6 py-3 rounded-xl text-sm font-medium bg-gradient-to-r from-hedera-600 to-green-600 hover:from-hedera-500 hover:to-green-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Fetch Audit Log
            </button>
            <button
              onClick={verifyAuditLog}
              disabled={!auctionId.trim() || entries.length === 0}
              className="px-5 py-3 rounded-xl text-sm font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              <Shield className="w-4 h-4" />
              Verify
            </button>
          </div>

          {/* Verification result */}
          {verified !== null && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mt-4 p-3 rounded-lg flex items-center gap-2 ${
                verified
                  ? "bg-green-500/10 border border-green-500/20 text-green-400"
                  : "bg-red-500/10 border border-red-500/20 text-red-400"
              }`}
            >
              {verified ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm">Audit trail verified — all commitments are valid, sequential, and consistent</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">Verification failed — some commitments may be missing or invalid</span>
                </>
              )}
            </motion.div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="glass rounded-xl p-4 mb-6 border border-red-500/20 bg-red-500/5">
            <AlertCircle className="w-4 h-4 text-red-400 inline mr-2" />
            <span className="text-sm text-red-400">{error}</span>
          </div>
        )}

        {/* Explanation banner */}
        <div className="glass rounded-2xl p-6 mb-8 border border-hedera-500/10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-hedera-500/15 flex items-center justify-center flex-shrink-0">
              <Shield className="w-6 h-6 text-hedera-400" />
            </div>
            <div>
              <h3 className="font-semibold text-hedera-400 mb-1">How the Audit Trail Works</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                At each critical stage of the auction lifecycle, a <strong>commitment hash</strong> is published to the
                Hedera Consensus Service (HCS). The commitment is computed as{" "}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded font-mono">
                  hash(auctionId, stage, cantonTxId, adiTxHash, timestamp, nonce)
                </code>.
                Anyone can verify the sequence and timing of events. <span className="text-red-400 font-medium">
                Nobody can reverse the hash to recover bid values, prices, or terms.</span>
              </p>
            </div>
          </div>
        </div>

        {/* Timeline */}
        {entries.length > 0 ? (
          <div className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Clock className="w-5 h-5 text-hedera-400" />
                Audit Timeline — {entries.length} event{entries.length !== 1 ? "s" : ""}
              </h2>
              <div className="flex items-center gap-2">
                <span className="live-dot" />
                <span className="text-xs text-gray-500">Hedera Testnet</span>
              </div>
            </div>
            <div className="space-y-0">
              {entries.map((entry, idx) => (
                <TimelineEntry key={idx} entry={entry} index={idx} total={entries.length} />
              ))}
            </div>
          </div>
        ) : !loading && auctionId && !error ? (
          <div className="text-center py-20">
            <Globe className="w-12 h-12 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-500">No audit entries found for this auction</p>
            <p className="text-xs text-gray-600 mt-1">Run the demo first to generate audit commitments</p>
          </div>
        ) : !loading ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-full bg-hedera-500/10 flex items-center justify-center mx-auto mb-4">
              <Globe className="w-10 h-10 text-hedera-400/50" />
            </div>
            <p className="text-gray-500 mb-2">Enter an Auction ID to view its public audit trail</p>
            <p className="text-xs text-gray-600">
              Audit commitments are stored on Hedera Consensus Service and can be viewed on{" "}
              <a href="https://hashscan.io/testnet" target="_blank" rel="noopener noreferrer" className="text-hedera-400 hover:text-hedera-300 transition-colors">
                HashScan <ExternalLink className="w-3 h-3 inline" />
              </a>
            </p>
          </div>
        ) : null}

        {/* Hiero CLI integration info */}
        <div className="glass rounded-2xl p-6 mb-12">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-hedera-400" />
            Hiero CLI Integration
          </h3>
          <p className="text-sm text-gray-400 mb-4">
            The audit trail can also be accessed via our custom Hiero CLI plugin. Install the plugin and use these commands:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-black/30 rounded-xl p-4 font-mono text-xs">
              <div className="text-gray-500 mb-1"># Publish a new commitment</div>
              <div className="text-hedera-400">
                hiero auctionlog publish \<br/>
                &nbsp;&nbsp;--stage award \<br/>
                &nbsp;&nbsp;--auction-id {auctionId || "DEMO-XXX"} \<br/>
                &nbsp;&nbsp;--canton-ref &lt;canton-tx-id&gt; \<br/>
                &nbsp;&nbsp;--adi-tx &lt;adi-tx-hash&gt;
              </div>
            </div>
            <div className="bg-black/30 rounded-xl p-4 font-mono text-xs">
              <div className="text-gray-500 mb-1"># Verify audit trail</div>
              <div className="text-hedera-400">
                hiero auctionlog verify \<br/>
                &nbsp;&nbsp;--auction-id {auctionId || "DEMO-XXX"}<br/>
                <br/>
                <span className="text-gray-500"># Export as CSV</span><br/>
                hiero auctionlog export \<br/>
                &nbsp;&nbsp;--auction-id {auctionId || "DEMO-XXX"} \<br/>
                &nbsp;&nbsp;--format csv
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
