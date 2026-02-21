"use client";

import { useEffect, useState, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import {
  Shield, Lock, Eye, EyeOff, Zap, Globe, ArrowRight, ChevronDown,
  Scale, FileSearch, Wallet, Layers, CheckCircle2,
  Database, Code2, Sparkles, ArrowUpRight, Play
} from "lucide-react";

/* ─── Perf-friendly fade wrapper — uses CSS + IntersectionObserver ─────── */
function FadeIn({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(28px)",
        transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}

/* ─── Minimal color helper ──────────────────────────────────────────────── */
const c = (color: string) => ({
  bg: color === "brand" ? "bg-indigo-500/10" : color === "canton" ? "bg-emerald-500/10" : color === "adi" ? "bg-orange-500/10" : "bg-purple-500/10",
  text: color === "brand" ? "text-indigo-400" : color === "canton" ? "text-emerald-400" : color === "adi" ? "text-orange-400" : "text-purple-400",
  border: color === "brand" ? "border-indigo-500/20" : color === "canton" ? "border-emerald-500/20" : color === "adi" ? "border-orange-500/20" : "border-purple-500/20",
  dot: color === "brand" ? "bg-indigo-500" : color === "canton" ? "bg-emerald-500" : color === "adi" ? "bg-orange-500" : "bg-purple-500",
});

/* ═══════════════════════════════════════════════════════════════════════════
 * NAVBAR
 * ═══════════════════════════════════════════════════════════════════════════ */
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "glass-strong" : ""}`}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">BlindBid</span>
        </Link>
        <div className="hidden md:flex items-center gap-8 text-[13px] text-gray-500">
          <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
          <a href="#privacy" className="hover:text-white transition-colors">Privacy</a>
          <a href="#tracks" className="hover:text-white transition-colors">Tracks</a>
          <a href="#architecture" className="hover:text-white transition-colors">Architecture</a>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/demo" className="px-4 py-2 text-sm font-medium rounded-lg bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08] transition-all flex items-center gap-2">
            <Play className="w-3.5 h-3.5 text-indigo-400" />
            Live Demo
          </Link>
        </div>
      </div>
    </nav>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * HERO — CSS gradients only, one motion element for parallax
 * ═══════════════════════════════════════════════════════════════════════════ */
function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

  return (
    <section ref={ref} className="relative min-h-screen flex items-center justify-center hero-bg noise overflow-hidden">
      {/* Static grid pattern — no JS */}
      <div className="absolute inset-0 grid-pattern z-[1]" />

      {/* Accent line at top */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[1px] bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

      <motion.div style={{ y, opacity }} className="relative z-10 text-center px-6 max-w-4xl mx-auto">
        {/* Badge */}
        <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-xs font-medium text-gray-400 mb-10">
          <span className="live-dot" />
          Live on Canton Sandbox · ADI Anvil · Hedera Testnet
        </div>

        {/* Title */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem] font-bold tracking-tight leading-[1.05] mb-5">
          <span className="gradient-text">BlindBid</span>
        </h1>
        <p className="text-2xl sm:text-3xl md:text-4xl font-extralight text-gray-300 mb-8 tracking-tight">
          Private Markets, Public Trust
        </p>

        {/* Description */}
        <p className="text-base md:text-lg text-gray-500 max-w-2xl mx-auto mb-12 leading-relaxed">
          A B2B marketplace where bidders submit{" "}
          <span className="text-indigo-400">confidential offers</span>, auction logic runs{" "}
          <span className="text-emerald-400">privately on Canton</span>, settlement is{" "}
          <span className="text-orange-400">gasless on ADI</span>, and a{" "}
          <span className="text-purple-400">Hedera audit trail</span> proves everything.
        </p>

        {/* CTAs */}
        <div className="flex items-center justify-center gap-3 flex-wrap mb-14">
          <Link
            href="/demo"
            className="group relative px-7 py-3 text-sm font-semibold rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 transition-all duration-300 shadow-xl shadow-indigo-500/15 flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Launch Live Demo
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <Link href="/privacy" className="px-7 py-3 text-sm font-medium rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-all flex items-center gap-2">
            <Eye className="w-4 h-4 text-emerald-400" />
            Privacy Explorer
          </Link>
          <Link href="/audit" className="px-7 py-3 text-sm font-medium rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-all flex items-center gap-2">
            <FileSearch className="w-4 h-4 text-purple-400" />
            Audit Trail
          </Link>
        </div>

        {/* Tech pills */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {[
            { name: "Canton Network", color: "canton" },
            { name: "Daml", color: "canton" },
            { name: "ADI · ERC-4337", color: "adi" },
            { name: "Hedera HCS", color: "hedera" },
            { name: "Hiero CLI", color: "hedera" },
          ].map((t) => (
            <span key={t.name} className={`px-3 py-1 rounded-full text-[11px] font-medium ${c(t.color).bg} ${c(t.color).text} border ${c(t.color).border}`}>
              {t.name}
            </span>
          ))}
        </div>
      </motion.div>

      {/* Scroll hint */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <ChevronDown className="w-5 h-5 text-gray-600" />
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * HOW IT WORKS
 * ═══════════════════════════════════════════════════════════════════════════ */
const STEPS = [
  { icon: Scale,  title: "Create Private Auction",        desc: "Seller deploys a Daml Auction contract on Canton with scoring weights and invited bidders.", tech: "Canton + Daml", color: "brand" },
  { icon: EyeOff, title: "Submit Sealed Bids",            desc: "Each bidder submits price, delivery SLA, penalties, warranty. Canton ensures bidders only see their own bid.", tech: "Canton Privacy", color: "canton" },
  { icon: Lock,   title: "Private Scoring & Award",       desc: "Multi-criteria scoring happens privately. The award proof shows criteria used — never actual bid values.", tech: "Daml Choices", color: "hedera" },
  { icon: Zap,    title: "Gasless Settlement on ADI",     desc: "Winner pays through ADI escrow with zero gas cost via ERC-4337 paymasters.", tech: "ADI · ERC-4337", color: "adi" },
  { icon: Globe,  title: "Public Audit on Hedera",        desc: "Hash commitments published to HCS. Anyone verifies timing — nobody reverses into business data.", tech: "Hedera HCS", color: "hedera" },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-28 px-6 section-dark">
      <div className="max-w-5xl mx-auto">
        <FadeIn className="text-center mb-16">
          <p className="text-xs font-semibold tracking-[0.2em] text-indigo-400 uppercase mb-3">Workflow</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">How BlindBid Works</h2>
          <p className="text-gray-500 text-base max-w-xl mx-auto">Five stages, three blockchains, zero data leakage.</p>
        </FadeIn>

        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[23px] top-6 bottom-6 w-px bg-gradient-to-b from-indigo-500/30 via-emerald-500/20 to-purple-500/30 hidden md:block" />

          <div className="space-y-5">
            {STEPS.map((step, i) => (
              <FadeIn key={step.title} delay={i * 0.08}>
                <div className="flex items-start gap-5 md:pl-0 group">
                  {/* Dot */}
                  <div className={`relative z-10 w-[46px] h-[46px] rounded-xl flex items-center justify-center flex-shrink-0 ${c(step.color).bg} border ${c(step.color).border} transition-all group-hover:scale-105`}>
                    <step.icon className={`w-5 h-5 ${c(step.color).text}`} />
                  </div>
                  {/* Content */}
                  <div className="flex-1 glass rounded-xl p-5 glow-hover card-shine">
                    <div className="flex items-center gap-3 mb-1.5">
                      <span className="text-[10px] font-bold text-gray-600 tracking-widest">STEP {i + 1}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${c(step.color).bg} ${c(step.color).text}`}>{step.tech}</span>
                    </div>
                    <h3 className="text-base font-semibold mb-1">{step.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * PRIVACY MODEL
 * ═══════════════════════════════════════════════════════════════════════════ */
function PrivacySection() {
  const parties = [
    { name: "Seller",  emoji: "👔", color: "brand",  sees: ["All bids & terms", "Full score breakdown", "All reputations", "Escrow status"], hidden: [] },
    { name: "Bidder A", emoji: "🏭", color: "canton", sees: ["Own bid only", "Own total score", "Auction stage", "Award criteria"], hidden: ["Other bids", "Score breakdown", "Weights"] },
    { name: "Bidder B", emoji: "🏗️", color: "adi",    sees: ["Own bid only", "Own total score", "Auction stage", "Award criteria"], hidden: ["Other bids", "Score breakdown", "Weights"] },
    { name: "Auditor",  emoji: "🔍", color: "hedera", sees: ["Auction metadata", "Winner identity", "Award proof", "Conditions"], hidden: ["Bid values", "Score details", "Exact weights"] },
  ];

  return (
    <section id="privacy" className="relative py-28 px-6 section-accent">
      <div className="max-w-6xl mx-auto">
        <FadeIn className="text-center mb-14">
          <p className="text-xs font-semibold tracking-[0.2em] text-emerald-400 uppercase mb-3">Canton Network</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Party-Based Privacy</h2>
          <p className="text-gray-500 text-base max-w-lg mx-auto">
            Enforced by the ledger, not application logic. Each party sees only what they&apos;re authorized to.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {parties.map((party, i) => (
            <FadeIn key={party.name} delay={i * 0.06}>
              <div className="glass rounded-xl p-5 glow-hover card-shine h-full">
                <div className="text-2xl mb-3">{party.emoji}</div>
                <h3 className={`text-sm font-bold mb-4 ${c(party.color).text}`}>{party.name}</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-bold text-gray-600 tracking-widest mb-1.5">CAN SEE</p>
                    {party.sees.map((s) => (
                      <div key={s} className="flex items-center gap-1.5 py-[3px]">
                        <Eye className="w-3 h-3 text-emerald-500/70 flex-shrink-0" />
                        <span className="text-xs text-gray-400">{s}</span>
                      </div>
                    ))}
                  </div>
                  {party.hidden.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-600 tracking-widest mb-1.5">HIDDEN</p>
                      {party.hidden.map((h) => (
                        <div key={h} className="flex items-center gap-1.5 py-[3px]">
                          <EyeOff className="w-3 h-3 text-red-500/40 flex-shrink-0" />
                          <span className="text-xs text-gray-600">{h}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </FadeIn>
          ))}
        </div>

        <FadeIn className="mt-8 text-center" delay={0.3}>
          <Link href="/privacy" className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-all">
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
            Explore live party views
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </FadeIn>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SPONSOR TRACKS
 * ═══════════════════════════════════════════════════════════════════════════ */
const TRACKS = [
  {
    name: "Canton Network",
    sub: "Privacy-First dApp",
    prize: "$8,000 · 3 winners",
    color: "canton",
    icon: Shield,
    why: "Canton is the only blockchain where privacy is protocol-level. In B2B markets, revealing bid details destroys leverage.",
    items: ["Full Daml contracts: Auction, SealedBid, ScoredBid, AwardedAuction, Reputation", "Real Canton Sandbox with compiled .dar", "Party-based visibility enforced by ledger", "Private scoring + explainable award proofs", "JSON API integration — every call goes through Canton"],
  },
  {
    name: "ADI Foundation",
    sub: "Paymaster Devtools",
    prize: "Paymaster Track",
    color: "adi",
    icon: Wallet,
    why: "Bidders shouldn't need crypto to participate. ERC-4337 paymasters enable zero-gas onboarding.",
    items: ["BlindBidNativePaymaster with sponsor signature validation", "BlindBidERC20Paymaster for token gas payments", "Allowlist targets/selectors + rate limits + expiry", "Demo failure cases: expired, invalid sig, bad selector", "E2E tests with tx hashes, account addresses, balances"],
  },
  {
    name: "Hedera",
    sub: "Hiero CLI Plugin",
    prize: "CLI Plugin Track",
    color: "hedera",
    icon: Globe,
    why: "Hash commitments on HCS prove fairness without leaking private data.",
    items: ["Custom plugin: auctionlog publish, verify, export, list", "Real HCS topic creation on Hedera testnet", "Commitment = hash(auctionId + stage + cantonTxId + adiTxHash + ts + nonce)", "Timeline verification + JSON/CSV export", "Zod schema validation on all I/O"],
  },
  {
    name: "ADI Foundation",
    sub: "Merchant Payments",
    prize: "Merchant Track",
    color: "adi",
    icon: Layers,
    why: "Real procurement needs multi-currency settlement — USD/AED listed, token settled.",
    items: ["Merchant registration + preferred currency", "Signed fiat-to-token quotes with slippage & expiry", "EIP-681 QR code + WalletConnect support", "Checkout sessions with payment status tracking", "BlindBidEscrow: deposit, release, refund, dispute, resolve"],
  },
];

function SponsorTracks() {
  return (
    <section id="tracks" className="relative py-28 px-6 mesh-gradient">
      <div className="max-w-5xl mx-auto">
        <FadeIn className="text-center mb-14">
          <p className="text-xs font-semibold tracking-[0.2em] text-purple-400 uppercase mb-3">Bounties</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Sponsor Tracks</h2>
          <p className="text-gray-500 text-base max-w-lg mx-auto">Every bounty met with real, working implementations.</p>
        </FadeIn>

        <div className="space-y-4">
          {TRACKS.map((track, i) => (
            <FadeIn key={track.name + track.sub} delay={i * 0.06}>
              <div className="glass rounded-xl overflow-hidden glow-hover card-shine">
                {/* Header stripe */}
                <div className={`h-[2px] ${track.color === "canton" ? "bg-emerald-500" : track.color === "adi" ? "bg-orange-500" : "bg-purple-500"}`} />
                <div className="p-6">
                  <div className="flex items-start gap-4 mb-5">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${c(track.color).bg} ${c(track.color).text}`}>
                      <track.icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold">{track.name}</h3>
                        <span className="text-xs text-gray-500">· {track.sub}</span>
                      </div>
                      <span className={`text-xs font-semibold ${c(track.color).text}`}>{track.prize}</span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-400 mb-5 leading-relaxed">{track.why}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                    {track.items.map((item) => (
                      <div key={item} className="flex items-start gap-2 py-1">
                        <CheckCircle2 className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${c(track.color).text} opacity-60`} />
                        <span className="text-xs text-gray-400 leading-relaxed">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE
 * ═══════════════════════════════════════════════════════════════════════════ */
function Architecture() {
  const layers = [
    { name: "Frontend",        desc: "Next.js + Framer Motion + Tailwind",     icon: Code2,   color: "brand" },
    { name: "Backend API",     desc: "Express.js + TypeScript + Ethers.js",    icon: Database, color: "brand" },
    { name: "Canton Sandbox",  desc: "Daml Contracts + JSON API + Privacy",    icon: Shield,  color: "canton" },
    { name: "ADI Chain",       desc: "ERC-4337 · Paymasters · Escrow · Anvil", icon: Wallet,  color: "adi" },
    { name: "Hedera Testnet",  desc: "HCS Topics · Audit Commitments",        icon: Globe,   color: "hedera" },
  ];

  return (
    <section id="architecture" className="relative py-28 px-6 section-dark">
      <div className="max-w-3xl mx-auto">
        <FadeIn className="text-center mb-14">
          <p className="text-xs font-semibold tracking-[0.2em] text-indigo-400 uppercase mb-3">Stack</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Architecture</h2>
          <p className="text-gray-500 text-base">Three blockchains, one seamless experience.</p>
        </FadeIn>

        <div className="relative">
          <div className="absolute left-[22px] top-5 bottom-5 w-px bg-gradient-to-b from-indigo-500/20 via-emerald-500/15 to-purple-500/20 hidden sm:block" />
          <div className="space-y-3">
            {layers.map((layer, i) => (
              <FadeIn key={layer.name} delay={i * 0.06}>
                <div className="flex items-center gap-4 sm:pl-0">
                  <div className={`relative z-10 w-[44px] h-[44px] rounded-lg flex items-center justify-center flex-shrink-0 ${c(layer.color).bg} border ${c(layer.color).border}`}>
                    <layer.icon className={`w-4 h-4 ${c(layer.color).text}`} />
                  </div>
                  <div className="glass rounded-lg px-4 py-3 flex-1 glow-hover">
                    <span className="font-semibold text-sm">{layer.name}</span>
                    <span className="text-xs text-gray-500 ml-2">{layer.desc}</span>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * CTA
 * ═══════════════════════════════════════════════════════════════════════════ */
function CTA() {
  return (
    <section className="relative py-28 px-6">
      <div className="max-w-3xl mx-auto text-center">
        <FadeIn>
          <div className="glass rounded-2xl p-10 md:p-14 relative overflow-hidden glow-hover">
            {/* Subtle inner glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.05] via-transparent to-purple-500/[0.05]" />
            <div className="relative z-10">
              <h2 className="text-2xl md:text-3xl font-bold mb-3">
                See It <span className="gradient-text">Live</span>
              </h2>
              <p className="text-gray-500 text-sm md:text-base mb-8 max-w-lg mx-auto leading-relaxed">
                Every auction, bid, and score runs on real Canton, ADI, and Hedera. No mocks. All verifiable.
              </p>
              <Link
                href="/demo"
                className="group inline-flex items-center gap-2 px-7 py-3.5 text-sm font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl hover:from-indigo-500 hover:to-purple-500 transition-all shadow-xl shadow-indigo-500/15"
              >
                <Sparkles className="w-4 h-4" />
                Launch Live Demo
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * FOOTER
 * ═══════════════════════════════════════════════════════════════════════════ */
function Footer() {
  return (
    <footer className="border-t border-white/[0.04] py-6 px-6">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5" />
          <span>BlindBid — ETHDenver 2026</span>
        </div>
        <div className="flex items-center gap-5">
          <span>Canton Network</span>
          <span>ADI Foundation</span>
          <span>Hedera</span>
        </div>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * PAGE
 * ═══════════════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <Navbar />
      <Hero />
      <HowItWorks />
      <PrivacySection />
      <SponsorTracks />
      <Architecture />
      <CTA />
      <Footer />
    </main>
  );
}
