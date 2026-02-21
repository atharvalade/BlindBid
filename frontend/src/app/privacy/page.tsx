"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Eye, EyeOff, Shield, Lock, ArrowLeft, RefreshCw,
  Loader2, AlertCircle, CheckCircle2, User, Sparkles,
  ChevronRight, Info, Search, FileSearch, Hash, Scale
} from "lucide-react";
import * as api from "@/lib/api";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PartyViewData {
  loaded: boolean;
  loading: boolean;
  error?: string;
  auction?: any;
  bids?: any[];
  reputation?: any;
}

const PARTIES = [
  { id: "Seller",  label: "Seller",   icon: "👔", desc: "Auction creator — sees everything about their own auction, all bids, and full scores", className: "party-seller",  bgClass: "party-bg-seller",  borderColor: "border-brand-500/30" },
  { id: "BidderA", label: "Bidder A", icon: "🏭", desc: "Submitted bid — sees only own bid and limited auction info; blind to other bids",     className: "party-bidderA", bgClass: "party-bg-bidderA", borderColor: "border-canton-500/30" },
  { id: "BidderB", label: "Bidder B", icon: "🏗️", desc: "Submitted bid — sees only own bid; cannot infer anything about Bidder A",            className: "party-bidderB", bgClass: "party-bg-bidderB", borderColor: "border-adi-500/30" },
  { id: "Auditor", label: "Auditor",  icon: "🔍", desc: "Neutral observer — can verify commitments and timeline but not see bid details",     className: "party-auditor", bgClass: "party-bg-auditor", borderColor: "border-hedera-500/30" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function FieldVisibility({ visible, label, value }: { visible: boolean; label: string; value?: string }) {
  return (
    <div className={`flex items-center justify-between py-2 px-3 rounded-lg transition-all ${
      visible ? "bg-green-500/5 border border-green-500/10" : "bg-red-500/5 border border-red-500/10"
    }`}>
      <div className="flex items-center gap-2">
        {visible ? (
          <Eye className="w-3.5 h-3.5 text-green-400" />
        ) : (
          <EyeOff className="w-3.5 h-3.5 text-red-400" />
        )}
        <span className="text-xs font-medium text-gray-300">{label}</span>
      </div>
      <span className={`text-xs font-mono ${visible ? "text-green-300" : "text-red-400"}`}>
        {visible ? (value || "Visible") : "HIDDEN"}
      </span>
    </div>
  );
}

// ─── Party View Card ────────────────────────────────────────────────────────

function PartyCard({ party, data }: { party: typeof PARTIES[0]; data: PartyViewData }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      className={`glass rounded-2xl overflow-hidden border ${party.borderColor} transition-all`}
    >
      {/* Party Header */}
      <div className={`${party.bgClass} p-4 border-b border-white/5`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{party.icon}</span>
          <div className="flex-1">
            <h3 className={`font-bold ${party.className}`}>{party.label}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{party.desc}</p>
          </div>
          {data.loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          ) : data.loaded ? (
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          ) : null}
        </div>
      </div>

      {/* Error */}
      {data.error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400">
          <AlertCircle className="w-3 h-3 inline mr-1" /> {data.error}
        </div>
      )}

      {/* Content */}
      <div className="p-4 space-y-3">
        {!data.loaded && !data.loading && (
          <div className="text-center py-6 text-gray-600 text-sm">
            Enter an auction ID above and load views to see this party&apos;s perspective
          </div>
        )}

        {data.loaded && data.auction && (
          <>
            {/* Auction Info */}
            <div>
              <h4 className="text-xs font-bold text-gray-500 tracking-wider mb-2">AUCTION DATA VISIBLE</h4>
              <div className="space-y-1.5">
                <FieldVisibility
                  visible={!!data.auction.auctionId}
                  label="Auction ID"
                  value={data.auction.auctionId}
                />
                <FieldVisibility
                  visible={!!data.auction.seller}
                  label="Seller Identity"
                  value={data.auction.seller?.slice(0, 15)}
                />
                <FieldVisibility
                  visible={!!data.auction.itemDescription}
                  label="Item Description"
                  value={data.auction.itemDescription?.slice(0, 20)}
                />
                <FieldVisibility
                  visible={!!data.auction.stage}
                  label="Auction Stage"
                  value={data.auction.stage}
                />
                <FieldVisibility
                  visible={!!data.auction.weights}
                  label="Scoring Weights"
                  value={data.auction.weights ? "Full weights" : undefined}
                />
                <FieldVisibility
                  visible={!!data.auction.constraints}
                  label="Constraints"
                  value={data.auction.constraints ? "Full constraints" : undefined}
                />
                <FieldVisibility
                  visible={!!data.auction.winner}
                  label="Winner"
                  value={data.auction.winner?.slice(0, 15)}
                />
              </div>
            </div>

            {/* Bids */}
            <div>
              <h4 className="text-xs font-bold text-gray-500 tracking-wider mb-2">
                BIDS VISIBLE ({data.auction.bids?.length || 0})
              </h4>
              {data.auction.bids && data.auction.bids.length > 0 ? (
                <div className="space-y-2">
                  {data.auction.bids.map((bid: any, idx: number) => (
                    <div key={idx} className="glass rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold">{bid.bidder}</span>
                        {bid.bidPackage?.price && (
                          <span className="text-xs font-mono text-green-400">${bid.bidPackage.price.toLocaleString()}</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        <FieldVisibility visible={!!bid.bidPackage?.price} label="Price" value={bid.bidPackage?.price ? `$${bid.bidPackage.price}` : undefined} />
                        <FieldVisibility visible={!!bid.bidPackage?.deliveryDays} label="Delivery" value={bid.bidPackage?.deliveryDays ? `${bid.bidPackage.deliveryDays} days` : undefined} />
                        <FieldVisibility visible={!!bid.bidPackage?.warranty} label="Warranty" />
                        <FieldVisibility visible={!!bid.score} label="Score" value={bid.score?.totalScore?.toString()} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-3 text-xs text-red-400 bg-red-500/5 rounded-lg border border-red-500/10">
                  <EyeOff className="w-4 h-4 mx-auto mb-1 opacity-50" />
                  No bids visible to this party
                </div>
              )}
            </div>

            {/* Award Proof */}
            {data.auction.awardProof && (
              <div>
                <h4 className="text-xs font-bold text-gray-500 tracking-wider mb-2">AWARD PROOF</h4>
                <div className="glass rounded-lg p-3 space-y-1.5">
                  <FieldVisibility visible={true} label="Criteria Used" value={data.auction.awardProof?.criteriaUsed?.join(", ")} />
                  <FieldVisibility visible={true} label="Winner Valid" value="Yes" />
                  <FieldVisibility visible={!data.auction.awardProof?.actualValues} label="Actual Bid Values" />
                </div>
              </div>
            )}

            {/* Raw JSON */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1"
            >
              <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
              Raw Canton API Response
            </button>
            <AnimatePresence>
              {expanded && (
                <motion.pre
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-[10px] font-mono text-gray-400 bg-black/30 rounded-lg p-3 overflow-auto max-h-60"
                >
                  {JSON.stringify(data.auction, null, 2)}
                </motion.pre>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PRIVACY PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function PrivacyPage() {
  const [auctionId, setAuctionId] = useState("");
  const [views, setViews] = useState<Record<string, PartyViewData>>(
    Object.fromEntries(PARTIES.map((p) => [p.id, { loaded: false, loading: false }]))
  );
  const [loadingAll, setLoadingAll] = useState(false);

  const loadPartyView = useCallback(async (partyId: string, aid: string) => {
    setViews((v) => ({
      ...v,
      [partyId]: { loaded: false, loading: true },
    }));
    try {
      const result = await api.getAuctionDetails(aid, partyId);
      setViews((v) => ({
        ...v,
        [partyId]: {
          loaded: true,
          loading: false,
          auction: result.data,
        },
      }));
    } catch (err: any) {
      setViews((v) => ({
        ...v,
        [partyId]: {
          loaded: true,
          loading: false,
          error: err.message,
          auction: null,
        },
      }));
    }
  }, []);

  const loadAll = useCallback(async () => {
    if (!auctionId.trim()) return;
    setLoadingAll(true);
    await Promise.all(PARTIES.map((p) => loadPartyView(p.id, auctionId)));
    setLoadingAll(false);
  }, [auctionId, loadPartyView]);

  // ─── Visibility Matrix ────────────────────────────────────────────────────

  const matrix = [
    { field: "Auction ID",       seller: true,  bidderA: true,  bidderB: true,  auditor: true  },
    { field: "Item Description", seller: true,  bidderA: true,  bidderB: true,  auditor: true  },
    { field: "Scoring Weights",  seller: true,  bidderA: false, bidderB: false, auditor: false },
    { field: "All Bid Values",   seller: true,  bidderA: false, bidderB: false, auditor: false },
    { field: "Own Bid",          seller: true,  bidderA: true,  bidderB: true,  auditor: false },
    { field: "Score Breakdown",  seller: true,  bidderA: false, bidderB: false, auditor: false },
    { field: "Winner Identity",  seller: true,  bidderA: true,  bidderB: true,  auditor: true  },
    { field: "Award Proof",      seller: true,  bidderA: true,  bidderB: true,  auditor: true  },
    { field: "Losing Bid Values",seller: true,  bidderA: false, bidderB: false, auditor: false },
    { field: "Reputation Data",  seller: true,  bidderA: false, bidderB: false, auditor: false },
    { field: "Escrow Details",   seller: true,  bidderA: true,  bidderB: false, auditor: false },
    { field: "Dispute Evidence", seller: true,  bidderA: true,  bidderB: false, auditor: true  },
  ];

  return (
    <main className="min-h-screen animated-gradient-bg">
      {/* Header */}
      <div className="glass-strong border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="font-bold text-lg flex items-center gap-2">
                <Shield className="w-4 h-4 text-canton-400" />
                Privacy Explorer
              </h1>
              <p className="text-xs text-gray-500">
                See exactly what each party can and cannot see — powered by Canton&apos;s party-based visibility
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/demo"
              className="px-4 py-2 rounded-lg text-xs font-medium bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 transition-all"
            >
              ← Run Demo First
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Search bar */}
        <div className="glass rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={auctionId}
                onChange={(e) => setAuctionId(e.target.value)}
                placeholder="Enter Auction ID (e.g., DEMO-M1X2Y3)"
                className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/50 transition-all placeholder:text-gray-600"
              />
            </div>
            <button
              onClick={loadAll}
              disabled={!auctionId.trim() || loadingAll}
              className="px-6 py-3 rounded-xl text-sm font-medium bg-gradient-to-r from-brand-600 to-canton-600 hover:from-brand-500 hover:to-canton-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {loadingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              Load All Party Views
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-3 flex items-center gap-1">
            <Info className="w-3 h-3" />
            This queries the Canton JSON API four times — once per party — to show exactly what each party is authorized to see
          </p>
        </div>

        {/* Visibility Matrix */}
        <div className="glass rounded-2xl p-6 mb-8 overflow-x-auto">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Scale className="w-5 h-5 text-brand-400" />
            Data Visibility Matrix
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            This matrix shows the theoretical visibility of each data field per party, enforced by Canton&apos;s privacy model.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Data Field</th>
                {PARTIES.map((p) => (
                  <th key={p.id} className="text-center py-3 px-4">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-lg">{p.icon}</span>
                      <span className={`text-xs font-bold ${p.className}`}>{p.label}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.field} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-4 text-gray-300 font-medium">{row.field}</td>
                  {["seller", "bidderA", "bidderB", "auditor"].map((key) => (
                    <td key={key} className="text-center py-3 px-4">
                      {(row as any)[key] ? (
                        <Eye className="w-4 h-4 text-green-400 mx-auto" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-red-400/50 mx-auto" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Party View Cards */}
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <FileSearch className="w-5 h-5 text-canton-400" />
          Live Party Views
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-12">
          {PARTIES.map((party) => (
            <PartyCard key={party.id} party={party} data={views[party.id]} />
          ))}
        </div>

        {/* Explanation */}
        <div className="glass rounded-2xl p-8 mb-12">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Lock className="w-5 h-5 text-brand-400" />
            How Canton Privacy Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <h3 className="font-semibold text-brand-400">Party-Based Visibility</h3>
              <p className="text-sm text-gray-400">
                In Canton, every contract has a set of <strong>stakeholders</strong> — parties who can see the contract.
                When a bidder submits a sealed bid, the contract is only visible to the bidder and the seller.
                Other bidders literally cannot query for it.
              </p>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-canton-400">Sub-transaction Privacy</h3>
              <p className="text-sm text-gray-400">
                Even within a single transaction, Canton shows each party only the parts they&apos;re authorized to see.
                The scoring computation is visible only to the seller. The award proof is crafted to share criteria
                without revealing actual values.
              </p>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-hedera-400">Auditable Without Leaking</h3>
              <p className="text-sm text-gray-400">
                The Auditor party can verify that events happened and that the timeline is consistent,
                but cannot see the actual bid values. Combined with Hedera commitments, this gives
                public verifiability with private execution.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
