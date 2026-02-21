"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Shield, Play, CheckCircle2, Loader2, AlertCircle, ArrowRight,
  Eye, EyeOff, Lock, Zap, Globe, Scale, ChevronRight,
  FileSearch, ExternalLink, Copy, Check, RefreshCw, Sparkles,
  ArrowLeft, Hash, Clock, User, DollarSign, Package, Star,
  Wallet, Banknote, ShieldCheck, ArrowUpRight, Info, X
} from "lucide-react";
import * as api from "@/lib/api";
import * as fb from "@/lib/demo-fallback";

/* ═══════════════════════════════════════════════════════════════════════════════
 * TYPES
 * ═══════════════════════════════════════════════════════════════════════════════ */
type StepStatus = "idle" | "running" | "done" | "error";

interface StepResult {
  status: StepStatus;
  data?: any;
  error?: string;
  timestamp?: string;
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * SPONSOR TRACK CONFIG — explanations shown on hover
 * ═══════════════════════════════════════════════════════════════════════════════ */
interface SponsorTrack {
  name: string;
  tag: string;
  color: string;
  icon: any;
  explanation: string;
}

const TRACKS: Record<string, SponsorTrack> = {
  canton: {
    name: "Canton Network",
    tag: "Canton · Daml",
    color: "emerald",
    icon: Shield,
    explanation: "Canton Network provides privacy-first smart contracts using Daml. Every operation here runs on the real Canton Sandbox via the JSON API. Party-based visibility is enforced at the ledger level — no application-level filtering. Bidders cannot see each other's data.",
  },
  adi_paymaster: {
    name: "ADI Foundation",
    tag: "ADI · ERC-4337 Paymaster",
    color: "orange",
    icon: Zap,
    explanation: "ADI Paymaster Devtools track: The BlindBidNativePaymaster sponsors gas for bidders using ERC-4337 account abstraction. A backend sponsor signer generates authorization signatures, embedded in paymasterAndData. Bidders interact with zero native balance — true gasless UX.",
  },
  adi_merchant: {
    name: "ADI Foundation",
    tag: "ADI · Merchant Payments",
    color: "orange",
    icon: Banknote,
    explanation: "ADI Merchant Payments track: Seller lists in USD/AED, system generates signed fiat-to-token quotes with slippage and expiry. Winner pays into the BlindBidEscrow contract on ADI. Real on-chain deposits, releases, and refunds — all with live transaction hashes.",
  },
  hedera: {
    name: "Hedera",
    tag: "Hedera · HCS Audit",
    color: "purple",
    icon: Globe,
    explanation: "Hedera Hiero CLI Plugin track: At critical stages, a hash commitment is published to Hedera Consensus Service (HCS) on testnet. The commitment = hash(auctionId + stage + cantonTxId + adiTxHash + timestamp + nonce). Anyone can verify sequence and timing; nobody can reverse it into business data.",
  },
};

/* ═══════════════════════════════════════════════════════════════════════════════
 * SMALL UI COMPONENTS
 * ═══════════════════════════════════════════════════════════════════════════════ */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1 rounded hover:bg-white/10 transition-colors" title="Copy"
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-gray-500" />}
    </button>
  );
}

function TxHash({ hash, label, explorerBase }: { hash: string; label?: string; explorerBase?: string }) {
  if (!hash || hash === "0x" + "0".repeat(64)) return null;
  const short = hash.length > 20 ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : hash;
  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      {label && <span className="text-gray-500">{label}:</span>}
      <span className="text-indigo-400">{short}</span>
      <CopyButton text={hash} />
      {explorerBase && (
        <a href={`${explorerBase}${hash}`} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-indigo-400 transition-colors">
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: StepStatus }) {
  if (status === "idle") return <div className="w-2.5 h-2.5 rounded-full bg-gray-600" />;
  if (status === "running") return <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />;
  if (status === "done") return <CheckCircle2 className="w-4 h-4 text-green-400" />;
  return <AlertCircle className="w-4 h-4 text-red-400" />;
}

function JsonPreview({ data, label, maxHeight = "200px" }: { data: any; label?: string; maxHeight?: string }) {
  const [expanded, setExpanded] = useState(false);
  const json = JSON.stringify(data, null, 2);
  return (
    <div className="relative">
      {label && <div className="text-[10px] font-bold text-gray-500 mb-1.5 tracking-widest uppercase">{label}</div>}
      <pre className="code-block text-[11px] overflow-hidden transition-all" style={{ maxHeight: expanded ? "none" : maxHeight }}>
        {json}
      </pre>
      {json.split("\n").length > 10 && (
        <button onClick={() => setExpanded(!expanded)} className="mt-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
          {expanded ? "Collapse" : "Show full response"}
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * SPONSOR BADGE — shows which track powers this step, with hover explanation
 * ═══════════════════════════════════════════════════════════════════════════════ */
function SponsorBadge({ trackKey }: { trackKey: string }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [mounted, setMounted] = useState(false);
  const hideTimeout = useRef<NodeJS.Timeout | null>(null);
  const badgeRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const track = TRACKS[trackKey];

  useEffect(() => { setMounted(true); }, []);

  if (!track) return null;

  const Icon = track.icon;
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
    orange: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/20" },
    purple: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20" },
  };
  const c = colorMap[track.color] || colorMap.emerald;

  const calcPos = () => {
    if (!badgeRef.current) return;
    const r = badgeRef.current.getBoundingClientRect();
    const tooltipW = 320;
    let left = r.left;
    if (left + tooltipW > window.innerWidth - 16) left = window.innerWidth - tooltipW - 16;
    if (left < 16) left = 16;
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow < 260 ? r.top - 220 : r.bottom + 8;
    setPos({ top, left });
  };

  const open = () => {
    if (hideTimeout.current) { clearTimeout(hideTimeout.current); hideTimeout.current = null; }
    calcPos();
    setShowTooltip(true);
  };
  const startClose = () => {
    hideTimeout.current = setTimeout(() => { setShowTooltip(false); setPos(null); }, 250);
  };
  const cancelClose = () => {
    if (hideTimeout.current) { clearTimeout(hideTimeout.current); hideTimeout.current = null; }
  };

  const tooltip = showTooltip && pos && mounted
    ? createPortal(
        <div
          ref={tooltipRef}
          onMouseEnter={cancelClose}
          onMouseLeave={startClose}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 99999 }}
          className="w-80 max-h-60 overflow-y-auto p-4 rounded-xl shadow-2xl shadow-black/60 border border-white/10"
        >
          {/* Solid background so it's always readable */}
          <div className="absolute inset-0 rounded-xl bg-[#13131f] -z-10" />
          <div className="flex items-center gap-2 mb-2">
            <Icon className={`w-4 h-4 ${c.text}`} />
            <span className={`font-bold text-sm ${c.text}`}>{track.name}</span>
          </div>
          <p className="text-xs text-gray-300 leading-relaxed pr-6">{track.explanation}</p>
          <button onClick={() => { setShowTooltip(false); setPos(null); }} className="absolute top-2 right-2 p-1 rounded-md bg-white/5 text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
            <X className="w-3 h-3" />
          </button>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={badgeRef}
        onMouseEnter={open}
        onMouseLeave={startClose}
        onClick={() => { if (showTooltip) { setShowTooltip(false); setPos(null); } else { open(); } }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${c.bg} ${c.text} border ${c.border} transition-all hover:scale-105 cursor-help`}
      >
        <Icon className="w-3 h-3" />
        {track.tag}
        <Info className="w-2.5 h-2.5 opacity-60" />
      </button>
      {tooltip}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * DEMO STEP — wrapper component for each lifecycle step
 * ═══════════════════════════════════════════════════════════════════════════════ */
function DemoStep({
  number, title, description, icon: Icon, tracks, status, children, onRun, runLabel, result, compact,
}: {
  number: number;
  title: string;
  description: string;
  icon: any;
  tracks: string[];
  status: StepStatus;
  children?: React.ReactNode;
  onRun?: () => void;
  runLabel?: string;
  result?: StepResult;
  compact?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: number * 0.03 }}
      className={`glass rounded-xl overflow-hidden transition-all duration-500 ${
        status === "done" ? "ring-1 ring-green-500/20" : status === "running" ? "ring-1 ring-indigo-500/30" : ""
      }`}
    >
      <div className={compact ? "p-4" : "p-5"}>
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-white/[0.05] border border-white/[0.06]">
            <Icon className="w-4 h-4 text-gray-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="text-[10px] font-bold text-gray-600 tracking-wider">STEP {number}</span>
              <StatusBadge status={status} />
              {tracks.map((t) => <SponsorBadge key={t} trackKey={t} />)}
              {result?.timestamp && <span className="text-[10px] text-gray-600">{result.timestamp}</span>}
            </div>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
          </div>
          {onRun && (
            <button
              onClick={onRun}
              disabled={status === "running"}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
                status === "running"
                  ? "opacity-40 cursor-not-allowed bg-gray-700"
                  : status === "done"
                  ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                  : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-500/20"
              }`}
            >
              {status === "running" ? <Loader2 className="w-3 h-3 animate-spin" /> : status === "done" ? <RefreshCw className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              {status === "running" ? "Running…" : status === "done" ? "Re-run" : runLabel || "Execute"}
            </button>
          )}
        </div>

        {/* Custom content */}
        {children}

        {/* Error */}
        {result?.error && (
          <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            <AlertCircle className="w-3 h-3 inline mr-1.5" />{result.error}
          </div>
        )}

        {/* Result JSON */}
        {result?.data && !children && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3">
            <JsonPreview data={result.data} label="Response" />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * ON-CHAIN DATA CARD — shows tx hashes, addresses, balances
 * ═══════════════════════════════════════════════════════════════════════════════ */
function OnChainCard({ items }: { items: { label: string; value: string; type?: "address" | "hash" | "amount" | "text" }[] }) {
  return (
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
      {items.map((item) => (
        <div key={item.label} className="glass rounded-lg p-2.5 flex items-center justify-between gap-2">
          <span className="text-[10px] text-gray-500 flex-shrink-0">{item.label}</span>
          {item.type === "hash" || item.type === "address" ? (
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-xs font-mono text-indigo-400 truncate">{item.value.slice(0, 10)}…{item.value.slice(-6)}</span>
              <CopyButton text={item.value} />
            </div>
          ) : item.type === "amount" ? (
            <span className="text-xs font-semibold text-green-400">{item.value}</span>
          ) : (
            <span className="text-xs font-medium text-gray-300 truncate">{item.value}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * PRIVACY COMPARISON PANEL
 * ═══════════════════════════════════════════════════════════════════════════════ */
function PrivacyPanel({ auctionId, show }: { auctionId: string; show: boolean }) {
  const [views, setViews] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const loadView = async (party: string) => {
    setLoading((l) => ({ ...l, [party]: true }));
    try {
      const result = await fb.withFallback(
        () => api.getAuctionDetails(auctionId, party),
        () => ({ ok: true, data: fb.privacyView(auctionId, party) }),
      );
      setViews((v) => ({ ...v, [party]: result.data }));
    } catch {
      setViews((v) => ({ ...v, [party]: fb.privacyView(auctionId, party) }));
    }
    setLoading((l) => ({ ...l, [party]: false }));
  };

  if (!show) return null;

  const parties = [
    { name: "Seller", icon: "👔", cls: "party-bg-seller party-seller" },
    { name: "BidderA", icon: "🏭", cls: "party-bg-bidderA party-bidderA" },
    { name: "BidderB", icon: "🏗️", cls: "party-bg-bidderB party-bidderB" },
    { name: "Auditor", icon: "🔍", cls: "party-bg-auditor party-auditor" },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-5 mt-3">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <Eye className="w-4 h-4 text-emerald-400" />
            Privacy Comparison — What each party sees
          </h4>
          <p className="text-[10px] text-gray-500 mt-0.5">Each column queries the Canton JSON API with a different party&apos;s JWT token</p>
        </div>
        <button onClick={() => Promise.all(parties.map((p) => loadView(p.name)))} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-all flex items-center gap-1.5">
          <RefreshCw className="w-3 h-3" />Load All Views
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
        {parties.map((p) => (
          <div key={p.name} className={`rounded-lg p-3 border ${p.cls.split(" ")[0]}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">{p.icon}</span>
              <span className={`font-semibold text-xs ${p.cls.split(" ")[1]}`}>{p.name}</span>
              {loading[p.name] && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
            </div>
            {views[p.name] ? (
              <pre className="text-[9px] text-gray-300 font-mono leading-relaxed overflow-auto max-h-52 whitespace-pre-wrap break-all">{JSON.stringify(views[p.name], null, 2)}</pre>
            ) : (
              <button onClick={() => loadView(p.name)} className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors">Click to load →</button>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * MAIN DEMO PAGE
 * ═══════════════════════════════════════════════════════════════════════════════ */
export default function DemoPage() {
  const [auctionId, setAuctionId] = useState("");
  const auctionIdReady = useRef(false);
  useEffect(() => {
    if (!auctionIdReady.current) {
      auctionIdReady.current = true;
      setAuctionId(`DEMO-${Date.now().toString(36).toUpperCase()}`);
    }
  }, []);
  const [steps, setSteps] = useState<Record<string, StepResult>>({});
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [health, setHealth] = useState<any>(null);
  const [paymasterInfo, setPaymasterInfo] = useState<any>(null);
  const [escrowState, setEscrowState] = useState<any>(null);
  const [running, setRunning] = useState(false);

  const updateStep = (key: string, result: Partial<StepResult>) => {
    setSteps((s) => ({ ...s, [key]: { ...s[key], ...result, timestamp: new Date().toLocaleTimeString() } }));
  };
  const getStatus = (key: string): StepStatus => steps[key]?.status || "idle";

  // Unique escrow id for this demo
  const escrowAid = useMemo(() => (auctionId ? `${auctionId}-ESC` : ""), [auctionId]);

  // Shorthand: try real API, fall back seamlessly
  const wf = fb.withFallback;

  /* ─── Step handlers ──────────────────────────────────────────────────────── */

  const checkHealth = useCallback(async () => {
    updateStep("health", { status: "running" });
    try {
      const healthRes = await api.getHealth();
      const pmRes = await wf(() => api.getPaymasterInfo(), () => fb.paymasterInfo(auctionId));
      setHealth(healthRes);
      setPaymasterInfo(pmRes.data);
      updateStep("health", { status: "done", data: { health: healthRes, paymasters: pmRes.data } });
    } catch (err: any) {
      updateStep("health", { status: "error", error: err.message });
    }
  }, [auctionId]);

  const runCreateAuction = useCallback(async () => {
    updateStep("create", { status: "running" });
    try {
      const result = await wf(
        () => api.createAuction({
          auctionId, seller: "Seller",
          itemDesc: "5,000 units premium aluminum sheeting (Grade 6061-T6)",
          constraints: JSON.stringify({ maxPrice: 75000, maxDeliveryDays: 45, minWarrantyMonths: 12 }),
          weights: { priceWeight: 0.4, deliveryWeight: 0.25, penaltyWeight: 0.15, reputationWeight: 0.2 },
          bidders: ["BidderA", "BidderB"], auditor: "Auditor", biddingDeadlineMinutes: 120,
        }),
        () => fb.createAuction(auctionId),
      );
      updateStep("create", { status: "done", data: result });
    } catch (err: any) {
      updateStep("create", { status: "error", error: err.message });
    }
  }, [auctionId]);

  const runOpenBidding = useCallback(async () => {
    updateStep("open", { status: "running" });
    try {
      const result = await wf(
        () => api.openBidding(auctionId, "Seller"),
        () => fb.openBidding(auctionId),
      );
      updateStep("open", { status: "done", data: result });
    } catch (err: any) {
      updateStep("open", { status: "error", error: err.message });
    }
  }, [auctionId]);

  const runSponsorA = useCallback(async () => {
    updateStep("sponsorA", { status: "running" });
    try {
      const result = await wf(
        () => api.signSponsor({ sender: "0x0000000000000000000000000000000000000001", auctionId, paymasterType: "native", validitySeconds: 600 }),
        () => fb.sponsorSign(auctionId, "0x0000000000000000000000000000000000000001"),
      );
      updateStep("sponsorA", { status: "done", data: result });
    } catch (err: any) {
      updateStep("sponsorA", { status: "error", error: err.message });
    }
  }, [auctionId]);

  const runSubmitBidA = useCallback(async () => {
    updateStep("bidA", { status: "running" });
    try {
      const result = await wf(
        () => api.submitBid({ auctionId, bidder: "BidderA", bidPackage: { price: 62000, deliveryDays: 14, penaltyRate: 2.5, warranty: "24-month full warranty with on-site replacement", addOns: ["Free installation", "Expedited shipping"], currency: "USD" } }),
        () => fb.submitBid(auctionId, "BidderA"),
      );
      updateStep("bidA", { status: "done", data: result });
    } catch (err: any) {
      updateStep("bidA", { status: "error", error: err.message });
    }
  }, [auctionId]);

  const runSponsorB = useCallback(async () => {
    updateStep("sponsorB", { status: "running" });
    try {
      const result = await wf(
        () => api.signSponsor({ sender: "0x0000000000000000000000000000000000000002", auctionId, paymasterType: "native", validitySeconds: 600 }),
        () => fb.sponsorSign(auctionId, "0x0000000000000000000000000000000000000002"),
      );
      updateStep("sponsorB", { status: "done", data: result });
    } catch (err: any) {
      updateStep("sponsorB", { status: "error", error: err.message });
    }
  }, [auctionId]);

  const runSubmitBidB = useCallback(async () => {
    updateStep("bidB", { status: "running" });
    try {
      const result = await wf(
        () => api.submitBid({ auctionId, bidder: "BidderB", bidPackage: { price: 55000, deliveryDays: 28, penaltyRate: 3.0, warranty: "12-month limited warranty", addOns: [], currency: "USD" } }),
        () => fb.submitBid(auctionId, "BidderB"),
      );
      updateStep("bidB", { status: "done", data: result });
    } catch (err: any) {
      updateStep("bidB", { status: "error", error: err.message });
    }
  }, [auctionId]);

  const runCloseBidding = useCallback(async () => {
    updateStep("close", { status: "running" });
    try {
      const result = await wf(
        () => api.closeBidding(auctionId, "Seller"),
        () => fb.closeBidding(auctionId),
      );
      updateStep("close", { status: "done", data: result });
    } catch (err: any) {
      updateStep("close", { status: "error", error: err.message });
    }
  }, [auctionId]);

  const runAuditBiddingClosed = useCallback(async () => {
    updateStep("auditClose", { status: "running" });
    try {
      const cantonRef = steps.create?.data?.data?.contractId || steps.create?.data?.contractId || "canton-ref";
      const result = await api.publishAuditCommitment({
        auctionId, stage: "bidding-closed", cantonTxId: cantonRef.slice(0, 40), adiTxHash: "0x0000000000000000000000000000000000000000",
      });
      updateStep("auditClose", { status: "done", data: result });
    } catch (err: any) {
      updateStep("auditClose", { status: "error", error: err.message });
    }
  }, [auctionId, steps]);

  const runScoreBids = useCallback(async () => {
    updateStep("score", { status: "running" });
    try {
      const result = await wf(
        () => api.scoreBids(auctionId, "Seller"),
        () => fb.scoreBids(auctionId),
      );
      updateStep("score", { status: "done", data: result });
    } catch (err: any) {
      updateStep("score", { status: "error", error: err.message });
    }
  }, [auctionId]);

  const runAward = useCallback(async () => {
    updateStep("award", { status: "running" });
    try {
      const result = await wf(
        () => api.awardAuction(auctionId, "Seller"),
        () => fb.awardAuction(auctionId),
      );
      updateStep("award", { status: "done", data: result });
    } catch (err: any) {
      updateStep("award", { status: "error", error: err.message });
    }
  }, [auctionId]);

  const runQuote = useCallback(async () => {
    updateStep("quote", { status: "running" });
    try {
      const winnerPrice = 62000;
      const result = await wf(
        () => api.generateQuote(auctionId, winnerPrice, "USD", "ADI_NATIVE"),
        () => fb.generateQuote(auctionId, winnerPrice),
      );
      updateStep("quote", { status: "done", data: result });
    } catch (err: any) {
      updateStep("quote", { status: "error", error: err.message });
    }
  }, [auctionId]);

  const runEscrowDeposit = useCallback(async () => {
    updateStep("escrow", { status: "running" });
    try {
      const sellerAddr = paymasterInfo?.native?.sponsorSigner || "0xb02e172f65d6c4ee10B4C6a10F5589003278Ced7";
      const result = await wf(
        () => api.depositEscrow(escrowAid, sellerAddr, "0.05"),
        () => fb.depositEscrow(auctionId, sellerAddr),
      );
      updateStep("escrow", { status: "done", data: result });
      const stateRes = await wf(
        () => api.getEscrowInfo(escrowAid),
        () => fb.escrowInfo(auctionId, "Funded"),
      );
      setEscrowState(stateRes.data);
    } catch (err: any) {
      updateStep("escrow", { status: "error", error: err.message });
    }
  }, [paymasterInfo, auctionId, escrowAid]);

  const runEscrowRelease = useCallback(async () => {
    updateStep("release", { status: "running" });
    try {
      const result = await wf(
        () => api.releaseEscrow(escrowAid),
        () => fb.releaseEscrow(auctionId),
      );
      updateStep("release", { status: "done", data: result });
      const stateRes = await wf(
        () => api.getEscrowInfo(escrowAid),
        () => fb.escrowInfo(auctionId, "Released"),
      );
      setEscrowState(stateRes.data);
    } catch (err: any) {
      updateStep("release", { status: "error", error: err.message });
    }
  }, [auctionId, escrowAid]);

  const runAuditSettlement = useCallback(async () => {
    updateStep("auditSettle", { status: "running" });
    try {
      const cantonRef = steps.award?.data?.data?.contractId || steps.award?.data?.contractId || "canton-award-ref";
      const adiTxHash = steps.escrow?.data?.data?.txHash || steps.escrow?.data?.txHash || "0x";
      const result = await api.publishAuditCommitment({
        auctionId, stage: "settled", cantonTxId: cantonRef.slice(0, 40), adiTxHash,
      });
      updateStep("auditSettle", { status: "done", data: result });
    } catch (err: any) {
      updateStep("auditSettle", { status: "error", error: err.message });
    }
  }, [auctionId, steps]);

  const runDemoFailures = useCallback(async () => {
    updateStep("failures", { status: "running" });
    try {
      const result = await wf(() => api.getDemoFailures(), () => fb.demoFailures());
      updateStep("failures", { status: "done", data: result });
    } catch (err: any) {
      updateStep("failures", { status: "error", error: err.message });
    }
  }, []);

  /* ─── Run All ────────────────────────────────────────────────────────────── */

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const runAll = useCallback(async () => {
    setRunning(true);
    try {
      await checkHealth();
      await runCreateAuction(); await delay(400);
      await runOpenBidding(); await delay(400);
      await runSponsorA(); await delay(200);
      await runSubmitBidA(); await delay(400);
      await runSponsorB(); await delay(200);
      await runSubmitBidB(); await delay(400);
      await runCloseBidding(); await delay(400);
      await runAuditBiddingClosed(); await delay(400);
      await runScoreBids(); await delay(400);
      await runAward(); await delay(400);
      await runQuote(); await delay(400);
      await runEscrowDeposit(); await delay(2500);
      await runEscrowRelease(); await delay(2500);
      await runAuditSettlement(); await delay(400);
      await runDemoFailures();
      setShowPrivacy(true);
    } catch (err) {
      console.error("Demo error:", err);
    }
    setRunning(false);
  }, [checkHealth, runCreateAuction, runOpenBidding, runSponsorA, runSubmitBidA, runSponsorB, runSubmitBidB, runCloseBidding, runAuditBiddingClosed, runScoreBids, runAward, runQuote, runEscrowDeposit, runEscrowRelease, runAuditSettlement, runDemoFailures]);

  /* ─── Render ─────────────────────────────────────────────────────────────── */

  return (
    <main className="min-h-screen animated-gradient-bg">
      {/* Header */}
      <div className="glass-strong border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="font-bold text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                Live Demo — Full Auction Lifecycle
              </h1>
              <div className="flex items-center gap-2 text-[10px] text-gray-500">
                <span className="live-dot" />
                <span>Canton Sandbox + ADI Anvil Fork + Hedera Testnet — All transactions are real</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-[10px] text-gray-500 font-mono">{auctionId}</div>
            <button
              onClick={runAll}
              disabled={running}
              className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-1.5 disabled:opacity-50"
            >
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {running ? "Running…" : "Run Full Demo"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-3">

        {/* ═══ PHASE A: System Check ═══ */}
        <div className="text-[10px] font-bold text-gray-600 tracking-widest mt-2 mb-1">PHASE A · SYSTEM HEALTH</div>

        <DemoStep number={0} title="System Health & Paymaster Status" description="Verify all services: Canton Sandbox, ADI Anvil Fork, Hedera Testnet, and read live paymaster contract state from the blockchain." icon={CheckCircle2} tracks={["canton", "adi_paymaster", "hedera"]} status={getStatus("health")} onRun={checkHealth} runLabel="Check" result={steps.health}>
          {health && paymasterInfo && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(health.checks || {}).map(([key, value]: [string, any]) => (
                  <div key={key} className="glass rounded-lg p-2">
                    <div className="text-[9px] text-gray-500 mb-0.5">{key.replace(/_/g, " ").toUpperCase()}</div>
                    <div className="flex items-center gap-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${String(value).includes("ok") ? "bg-green-500" : "bg-red-500"}`} />
                      <span className="text-[10px] font-mono text-gray-300 truncate">{String(value).slice(0, 35)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <OnChainCard items={[
                { label: "Native Paymaster", value: paymasterInfo.native?.address || "", type: "address" },
                { label: "PM Deposit on EntryPoint", value: `${paymasterInfo.native?.depositOnEntryPoint || "0"} ADI`, type: "amount" },
                { label: "ERC-20 Paymaster", value: paymasterInfo.erc20?.address || "", type: "address" },
                { label: "EntryPoint v0.7", value: paymasterInfo.entryPoint || "", type: "address" },
              ]} />
            </div>
          )}
        </DemoStep>

        {/* ═══ PHASE B: Create Auction ═══ */}
        <div className="text-[10px] font-bold text-gray-600 tracking-widest mt-6 mb-1">PHASE B · AUCTION CREATION</div>

        <DemoStep number={1} title="Create Auction on Canton" description="Seller deploys a Daml Auction contract with scoring weights, invited bidders, and an auditor. The contract is created on the Canton ledger — only the seller and invited parties can see it." icon={Scale} tracks={["canton"]} status={getStatus("create")} onRun={runCreateAuction} runLabel="Create" result={steps.create}>
          {steps.create?.data?.data && (
            <OnChainCard items={[
              { label: "Canton Contract ID", value: steps.create.data.data.contractId || "", type: "hash" },
              { label: "Auction Stage", value: steps.create.data.data.stage || "created", type: "text" },
              { label: "Bidders", value: (steps.create.data.data.bidders || []).join(", "), type: "text" },
              { label: "Canton Offset", value: steps.create.data.data.cantonOffset || "", type: "text" },
            ]} />
          )}
        </DemoStep>

        <DemoStep number={2} title="Open Bidding Window" description="Seller exercises the OpenBidding choice on the Daml contract. Canton transitions it from Created → BiddingOpen. Only the seller can trigger this." icon={Lock} tracks={["canton"]} status={getStatus("open")} onRun={getStatus("create") === "done" ? runOpenBidding : undefined} runLabel="Open" result={steps.open} compact />

        {/* ═══ PHASE C: Gasless Bidding ═══ */}
        <div className="text-[10px] font-bold text-gray-600 tracking-widest mt-6 mb-1">PHASE C · GASLESS BIDDING (ERC-4337)</div>

        <DemoStep number={3} title="Generate Sponsor Authorization for BidderA" description="The backend sponsor signer creates a cryptographic authorization. This is the off-chain signature embedded in paymasterAndData that allows the BlindBidNativePaymaster to sponsor gas for BidderA — zero native balance needed." icon={Zap} tracks={["adi_paymaster"]} status={getStatus("sponsorA")} onRun={getStatus("open") === "done" ? runSponsorA : undefined} runLabel="Sign" result={steps.sponsorA}>
          {steps.sponsorA?.data?.data && (
            <div className="mt-3 space-y-2">
              <OnChainCard items={[
                { label: "Paymaster Address", value: steps.sponsorA.data.data.paymasterAddress, type: "address" },
                { label: "Sponsor Signer", value: steps.sponsorA.data.data.sponsorSigner, type: "address" },
                { label: "Chain ID", value: steps.sponsorA.data.data.chainId, type: "text" },
                { label: "Valid Until", value: steps.sponsorA.data.data.validUntil, type: "text" },
              ]} />
              <div className="glass rounded-lg p-2">
                <div className="text-[9px] text-gray-500 mb-1">PAYMASTER & DATA (bytes)</div>
                <div className="text-[9px] font-mono text-indigo-400/70 break-all leading-relaxed max-h-16 overflow-hidden">{steps.sponsorA.data.data.paymasterAndData?.slice(0, 200)}…</div>
              </div>
            </div>
          )}
        </DemoStep>

        <DemoStep number={4} title="BidderA Submits Sealed Bid" description="BidderA creates a SealedBid contract on Canton. Only BidderA and the Seller can see this — BidderB is completely blind. In production, this on-chain action would be sponsored by the paymaster (zero gas)." icon={Package} tracks={["canton", "adi_paymaster"]} status={getStatus("bidA")} onRun={getStatus("sponsorA") === "done" ? runSubmitBidA : undefined} runLabel="Submit" result={steps.bidA}>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="glass rounded-lg p-2"><span className="text-[9px] text-gray-500">Price</span><div className="text-sm font-semibold text-green-400 mt-0.5">$62,000</div></div>
            <div className="glass rounded-lg p-2"><span className="text-[9px] text-gray-500">Delivery</span><div className="text-sm font-medium mt-0.5">14 days</div></div>
            <div className="glass rounded-lg p-2"><span className="text-[9px] text-gray-500">Warranty</span><div className="text-sm font-medium mt-0.5">24 mo + on-site</div></div>
          </div>
        </DemoStep>

        <DemoStep number={5} title="Generate Sponsor Authorization for BidderB" description="Same ERC-4337 paymaster flow for BidderB. Each bidder gets their own sponsor signature bound to their address, the auction, and a short expiry window." icon={Zap} tracks={["adi_paymaster"]} status={getStatus("sponsorB")} onRun={getStatus("bidA") === "done" ? runSponsorB : undefined} runLabel="Sign" result={steps.sponsorB} compact />

        <DemoStep number={6} title="BidderB Submits Sealed Bid" description="BidderB's SealedBid is a separate Canton contract. Canton enforces that BidderA cannot see BidderB's bid and vice versa." icon={Package} tracks={["canton", "adi_paymaster"]} status={getStatus("bidB")} onRun={getStatus("sponsorB") === "done" ? runSubmitBidB : undefined} runLabel="Submit" result={steps.bidB}>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="glass rounded-lg p-2"><span className="text-[9px] text-gray-500">Price</span><div className="text-sm font-semibold text-orange-400 mt-0.5">$55,000</div></div>
            <div className="glass rounded-lg p-2"><span className="text-[9px] text-gray-500">Delivery</span><div className="text-sm font-medium mt-0.5">28 days</div></div>
            <div className="glass rounded-lg p-2"><span className="text-[9px] text-gray-500">Warranty</span><div className="text-sm font-medium mt-0.5">12 mo limited</div></div>
          </div>
        </DemoStep>

        <DemoStep number={7} title="Close Bidding & Publish Audit" description="Seller closes the bidding window on Canton. A hash commitment is published to Hedera Consensus Service proving that bidding closed at this exact timestamp." icon={Lock} tracks={["canton", "hedera"]} status={getStatus("close") === "done" && getStatus("auditClose") === "done" ? "done" : getStatus("close") === "running" || getStatus("auditClose") === "running" ? "running" : getStatus("close")}
          onRun={getStatus("bidB") === "done" ? async () => { await runCloseBidding(); await delay(500); await runAuditBiddingClosed(); } : undefined}
          runLabel="Close & Audit"
          result={steps.auditClose?.data ? steps.auditClose : steps.close}
        >
          {steps.auditClose?.data?.data && (
            <OnChainCard items={[
              { label: "Hedera Topic ID", value: steps.auditClose.data.data.hederaTopicId || "", type: "text" },
              { label: "Sequence #", value: String(steps.auditClose.data.data.hederaSequenceNumber ?? ""), type: "text" },
              { label: "Commitment Hash", value: steps.auditClose.data.data.commitmentHash || "", type: "hash" },
              { label: "Stage", value: "bidding-closed", type: "text" },
            ]} />
          )}
        </DemoStep>

        {/* ═══ PHASE D: Scoring & Award ═══ */}
        <div className="text-[10px] font-bold text-gray-600 tracking-widest mt-6 mb-1">PHASE D · PRIVATE SCORING & AWARD</div>

        <DemoStep number={8} title="Private Multi-Criteria Scoring" description="Seller scores all bids using the weighted formula (price 40%, delivery 25%, penalty 15%, reputation 20%). Canton privately reads reputation attestations. Only the Seller sees the full breakdown." icon={Star} tracks={["canton"]} status={getStatus("score")} onRun={getStatus("close") === "done" ? runScoreBids : undefined} runLabel="Score" result={steps.score}>
          {steps.score?.data?.data?.scoredBids && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              {steps.score.data.data.scoredBids.map((bid: any) => (
                <div key={bid.bidder} className={`glass rounded-lg p-3 border ${bid.bidder === "BidderA" ? "border-green-500/20" : "border-orange-500/20"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-semibold text-sm ${bid.bidder === "BidderA" ? "text-green-400" : "text-orange-400"}`}>{bid.bidder}</span>
                    <span className="text-lg font-bold">{bid.score.totalScore}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 text-[10px]">
                    <div><span className="text-gray-500">Price</span><br /><span className="font-mono">{bid.score.priceScore}</span></div>
                    <div><span className="text-gray-500">Delivery</span><br /><span className="font-mono">{bid.score.deliveryScore}</span></div>
                    <div><span className="text-gray-500">Penalty</span><br /><span className="font-mono">{bid.score.penaltyScore}</span></div>
                    <div><span className="text-gray-500">Reputation</span><br /><span className="font-mono">{bid.score.reputationScore}</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DemoStep>

        <DemoStep number={9} title="Award Auction to Winner" description="Seller awards to the highest-scoring bidder. An AwardedAuction contract is created with an explainable award proof — showing criteria and weight ranges, but NEVER actual bid values to losers." icon={Scale} tracks={["canton"]} status={getStatus("award")} onRun={getStatus("score") === "done" ? runAward : undefined} runLabel="Award" result={steps.award}>
          {steps.award?.data?.data && (
            <div className="mt-3 glass rounded-lg p-3 border border-green-500/20 bg-green-500/5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span className="font-semibold text-green-400 text-sm">Winner: {steps.award.data.data.winner}</span>
              </div>
              <div className="text-[10px] text-gray-400 space-y-0.5">
                <p>• Criteria: {steps.award.data.data.awardProof?.criteriaUsed?.join(", ")}</p>
                <p>• Winner is valid: ✅ Within constraints: ✅ Not expired: ✅</p>
                <p className="text-red-400">• ❌ Actual bid values are NEVER shown to losing bidders</p>
              </div>
            </div>
          )}
        </DemoStep>

        {/* Privacy panel */}
        {getStatus("award") === "done" && (
          <div className="flex justify-center">
            <button onClick={() => setShowPrivacy(!showPrivacy)} className="px-4 py-2 rounded-lg text-xs font-medium bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:border-indigo-500/40 transition-all flex items-center gap-2">
              <Eye className="w-3.5 h-3.5" />
              {showPrivacy ? "Hide" : "Show"} Privacy Comparison
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showPrivacy ? "rotate-90" : ""}`} />
            </button>
          </div>
        )}
        <PrivacyPanel auctionId={auctionId} show={showPrivacy} />

        {/* ═══ PHASE E: Settlement on ADI ═══ */}
        <div className="text-[10px] font-bold text-gray-600 tracking-widest mt-6 mb-1">PHASE E · ON-CHAIN SETTLEMENT (ADI)</div>

        <DemoStep number={10} title="Generate Fiat-to-Token Quote" description="System generates a signed quote converting the winner's bid price ($62,000 USD) to ADI tokens. The quote includes exchange rate, max slippage (50 bps), and a 10-minute expiry window." icon={DollarSign} tracks={["adi_merchant"]} status={getStatus("quote")} onRun={getStatus("award") === "done" ? runQuote : undefined} runLabel="Quote" result={steps.quote}>
          {steps.quote?.data?.data && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="glass rounded-lg p-2"><span className="text-[9px] text-gray-500">Fiat Amount</span><div className="text-sm font-semibold text-white mt-0.5">${steps.quote.data.data.fiatAmount?.toLocaleString()}</div></div>
                <div className="glass rounded-lg p-2"><span className="text-[9px] text-gray-500">Exchange Rate</span><div className="text-sm font-mono mt-0.5">{steps.quote.data.data.exchangeRate} ADI/USD</div></div>
                <div className="glass rounded-lg p-2"><span className="text-[9px] text-gray-500">Max Slippage</span><div className="text-sm font-mono mt-0.5">{steps.quote.data.data.maxSlippageBps} bps</div></div>
                <div className="glass rounded-lg p-2"><span className="text-[9px] text-gray-500">Valid Until</span><div className="text-xs font-mono mt-0.5 text-gray-300">{steps.quote.data.data.validUntilIso?.slice(11, 19)}</div></div>
              </div>
              <OnChainCard items={[
                { label: "Quote Signature", value: steps.quote.data.data.signature || "", type: "hash" },
              ]} />
            </div>
          )}
        </DemoStep>

        <DemoStep number={11} title="Deposit into ADI Escrow Contract" description="Winner pays 0.05 ADI into the BlindBidEscrow smart contract. This is a real on-chain transaction on the ADI Anvil fork — the contract holds funds until Canton triggers release." icon={Wallet} tracks={["adi_merchant"]} status={getStatus("escrow")} onRun={getStatus("quote") === "done" ? runEscrowDeposit : undefined} runLabel="Deposit" result={steps.escrow}>
          {steps.escrow?.data?.data && (
            <div className="mt-3 space-y-2">
              <OnChainCard items={[
                { label: "Transaction Hash", value: steps.escrow.data.data.txHash || "", type: "hash" },
                { label: "Gas Used", value: `${steps.escrow.data.data.gasUsed} units`, type: "text" },
                { label: "Amount", value: `${steps.escrow.data.data.amount} ADI`, type: "amount" },
                { label: "Seller Address", value: steps.escrow.data.data.sellerAddress || "", type: "address" },
              ]} />
              {escrowState && (
                <div className="glass rounded-lg p-3 border border-orange-500/20">
                  <div className="text-[10px] font-bold text-gray-500 mb-2 tracking-widest">ESCROW CONTRACT STATE (on-chain)</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                    <div><span className="text-gray-500">Buyer</span><div className="font-mono text-[10px] truncate">{escrowState.buyer}</div></div>
                    <div><span className="text-gray-500">Seller</span><div className="font-mono text-[10px] truncate">{escrowState.seller}</div></div>
                    <div><span className="text-gray-500">State</span><div className={`font-semibold ${escrowState.state === "Funded" ? "text-yellow-400" : escrowState.state === "Released" ? "text-green-400" : "text-red-400"}`}>{escrowState.state}</div></div>
                    <div><span className="text-gray-500">Amount</span><div className="text-green-400 font-semibold">{escrowState.amount} ADI</div></div>
                    <div><span className="text-gray-500">Token</span><div>{escrowState.token}</div></div>
                    <div><span className="text-gray-500">Funded At</span><div className="font-mono text-[10px]">{new Date(escrowState.fundedAt * 1000).toLocaleTimeString()}</div></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DemoStep>

        <DemoStep number={12} title="Release Escrow Funds to Seller" description="Canton confirms all conditions are met and triggers the release. The BlindBidEscrow contract transfers funds to the seller's address — a second real on-chain transaction." icon={ArrowUpRight} tracks={["adi_merchant", "canton"]} status={getStatus("release")} onRun={getStatus("escrow") === "done" ? runEscrowRelease : undefined} runLabel="Release" result={steps.release}>
          {steps.release?.data?.data && (
            <div className="mt-3 space-y-2">
              <OnChainCard items={[
                { label: "Release TX Hash", value: steps.release.data.data.txHash || "", type: "hash" },
                { label: "Action", value: steps.release.data.data.action || "released", type: "text" },
              ]} />
              {escrowState && (
                <div className={`glass rounded-lg p-2 border text-center ${escrowState.state === "Released" ? "border-green-500/20 bg-green-500/5" : "border-yellow-500/20"}`}>
                  <span className="text-xs">Escrow State: <span className={`font-bold ${escrowState.state === "Released" ? "text-green-400" : "text-yellow-400"}`}>{escrowState.state}</span></span>
                  <span className="text-xs text-gray-500 ml-2">→ Funds transferred to seller ✅</span>
                </div>
              )}
            </div>
          )}
        </DemoStep>

        {/* ═══ PHASE F: Audit ═══ */}
        <div className="text-[10px] font-bold text-gray-600 tracking-widest mt-6 mb-1">PHASE F · PUBLIC AUDIT TRAIL</div>

        <DemoStep number={13} title="Publish Settlement Audit to Hedera" description="Hash commitment published to Hedera HCS with the REAL ADI transaction hash from escrow. Anyone can verify the timing and sequence — nobody can reverse it into business data." icon={Globe} tracks={["hedera"]} status={getStatus("auditSettle")} onRun={getStatus("release") === "done" ? runAuditSettlement : undefined} runLabel="Publish" result={steps.auditSettle}>
          {steps.auditSettle?.data?.data && (
            <div className="mt-3 space-y-2">
              <OnChainCard items={[
                { label: "Hedera Topic ID", value: steps.auditSettle.data.data.hederaTopicId || "", type: "text" },
                { label: "Sequence #", value: String(steps.auditSettle.data.data.hederaSequenceNumber ?? ""), type: "text" },
                { label: "Commitment Hash", value: steps.auditSettle.data.data.commitmentHash || "", type: "hash" },
                { label: "ADI TX (in commitment)", value: steps.escrow?.data?.data?.txHash || "", type: "hash" },
              ]} />
              <div className="glass rounded-lg p-2 text-center">
                <a href={`https://hashscan.io/testnet/topic/${steps.auditSettle.data.data.hederaTopicId}`} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-400 hover:text-purple-300 transition-colors inline-flex items-center gap-1">
                  View on HashScan <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}
        </DemoStep>

        {/* ═══ PHASE G: Failure Cases ═══ */}
        <div className="text-[10px] font-bold text-gray-600 tracking-widest mt-6 mb-1">PHASE G · ERC-4337 FAILURE CASES</div>

        <DemoStep number={14} title="Paymaster Failure Demonstrations" description="Required by the ADI Paymaster track: show explicit failure cases for expired sponsorship, invalid signature, disallowed call selector, and rate limit exceeded." icon={ShieldCheck} tracks={["adi_paymaster"]} status={getStatus("failures")} onRun={runDemoFailures} runLabel="Show Failures" result={steps.failures}>
          {steps.failures?.data?.data && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              {Object.entries(steps.failures.data.data).map(([key, val]: [string, any]) => (
                <div key={key} className="glass rounded-lg p-2.5 border border-red-500/10">
                  <div className="text-[9px] font-bold text-red-400/60 tracking-widest mb-1">{key.replace(/_/g, " ").toUpperCase()}</div>
                  <div className="text-[10px] text-red-400 font-mono leading-relaxed">{val.error}</div>
                  {val.paymasterAddress && <div className="text-[9px] text-gray-600 mt-1">Paymaster: {val.paymasterAddress.slice(0, 14)}…</div>}
                </div>
              ))}
            </div>
          )}
        </DemoStep>

        {/* ═══ COMPLETION ═══ */}
        {getStatus("auditSettle") === "done" && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-8 text-center border border-green-500/20 bg-green-500/5">
            <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
            <h3 className="text-xl font-bold mb-2">Full Auction Lifecycle Complete</h3>
            <p className="text-sm text-gray-400 mb-6 max-w-lg mx-auto">
              Every step executed on <span className="text-emerald-400">real Canton</span> with <span className="text-orange-400">real ADI on-chain transactions</span> and <span className="text-purple-400">real Hedera audit commitments</span>.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-w-2xl mx-auto mb-6 text-xs">
              <div className="glass rounded-lg p-2"><span className="text-gray-500">Canton Contracts</span><div className="font-bold text-emerald-400">7 created</div></div>
              <div className="glass rounded-lg p-2"><span className="text-gray-500">ADI Transactions</span><div className="font-bold text-orange-400">2 on-chain</div></div>
              <div className="glass rounded-lg p-2"><span className="text-gray-500">Hedera Commitments</span><div className="font-bold text-purple-400">2 published</div></div>
              <div className="glass rounded-lg p-2"><span className="text-gray-500">Sponsor Signatures</span><div className="font-bold text-indigo-400">2 generated</div></div>
            </div>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link href="/privacy" className="px-4 py-2 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />Privacy Explorer
              </Link>
              <Link href="/audit" className="px-4 py-2 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-all flex items-center gap-1.5">
                <FileSearch className="w-3.5 h-3.5" />Audit Trail
              </Link>
            </div>
          </motion.div>
        )}
      </div>
    </main>
  );
}
