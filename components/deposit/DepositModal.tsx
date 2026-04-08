"use client";

import { useState, useEffect } from "react";
import { X, Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import { useAppStore } from "@/store";
import { cn } from "@/lib/utils";

type Tab = "card" | "usdc" | "deso";
type Network = "solana" | "polygon" | "ethereum";

type DepositModalProps = {
  onClose: () => void;
};

export function DepositModal({ onClose }: DepositModalProps) {
  const { desoPublicKey, desoBalanceDeso, desoBalanceUSD } = useAppStore();
  const [tab, setTab] = useState<Tab>("card");
  const [network, setNetwork] = useState<Network>("solana");
  const [copied, setCopied] = useState(false);
  const [feesOpen, setFeesOpen] = useState(false);

  const predictionsAffordable = Math.floor(desoBalanceUSD / 5);
  const hasStarterDeso = desoBalanceDeso > 0 && desoBalanceDeso < 0.5;
  const hasRealDeso = desoBalanceDeso >= 0.5;

  // Mark as welcomed so auto-open only fires once
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("caldera_welcomed", "true");
    }
  }, []);

  const handleCopy = () => {
    if (!desoPublicKey) return;
    navigator.clipboard.writeText(desoPublicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const heroSwapDepositTicker =
    network === "solana" ? "USDC-SOL" : network === "polygon" ? "USDC-MATIC" : "USDC";
  const heroSwapSrc = desoPublicKey
    ? `https://heroswap.com/embed?depositTicker=${heroSwapDepositTicker}&receiveTicker=DUSD&receiveAddress=${desoPublicKey}`
    : `https://heroswap.com/embed?depositTicker=${heroSwapDepositTicker}&receiveTicker=DUSD`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 md:items-center md:p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-md overflow-y-auto rounded-t-2xl md:rounded-2xl"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
            Add Funds
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {/* Celebration banner — above tabs, only for starter DESO */}
          {hasStarterDeso && (
            <div className="mb-4 rounded-xl border border-green-700 bg-green-950 p-4">
              <p className="font-medium text-green-300">🎉 You&apos;re already funded!</p>
              <p className="mt-1 text-sm text-green-400">
                DeSo gave you starter DESO when you signed up. You can place your
                first prediction now. Add more to bet bigger.
              </p>
            </div>
          )}

          {/* Tabs */}
          <div className="mb-5 flex rounded-lg p-1" style={{ background: "var(--bg-elevated)" }}>
            {(
              [
                { key: "card" as Tab, label: "Card / USDC" },
                { key: "usdc" as Tab, label: "Send USDC" },
                { key: "deso" as Tab, label: "DESO Wallet" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex-1 rounded-md py-2 text-xs font-medium transition-colors",
                  tab === t.key
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ─── TAB 1: Card / USDC ─── */}
          {tab === "card" && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  Deposit via USDC
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  Send USDC from any chain. Solana is cheapest.
                </p>
              </div>

              {/* Network pills */}
              <div>
                <p className="mb-2 text-xs text-[var(--text-secondary)]">Select network</p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { key: "solana" as Network, label: "✅ Solana (recommended)" },
                      { key: "polygon" as Network, label: "Polygon" },
                      { key: "ethereum" as Network, label: "⚠️ Ethereum" },
                    ] as const
                  ).map((n) => (
                    <button
                      key={n.key}
                      onClick={() => setNetwork(n.key)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                        network === n.key
                          ? "border border-cyan-600 bg-cyan-900 text-cyan-300"
                          : "border border-transparent bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      )}
                    >
                      {n.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ethereum warning */}
              {network === "ethereum" && (
                <div className="rounded-xl border border-orange-800 bg-orange-950 p-3 text-xs text-orange-300">
                  ⚠️ Ethereum gas fees are $5–15. Only use for deposits over $100.
                  Use Solana USDC for small amounts.
                </div>
              )}

              {/* HeroSwap iframe */}
              {desoPublicKey ? (
                <iframe
                  src={heroSwapSrc}
                  width="100%"
                  height="380"
                  style={{ border: "none", borderRadius: "12px" }}
                  allow="clipboard-write"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  title="HeroSwap deposit"
                />
              ) : (
                <div
                  className="flex h-40 items-center justify-center rounded-xl text-sm text-[var(--text-secondary)]"
                  style={{ background: "var(--bg-elevated)" }}
                >
                  Connect your wallet first to deposit
                </div>
              )}

              <p className="text-xs text-[var(--text-secondary)]">
                {network === "solana"
                  ? "~0.5% HeroSwap fee · Near-zero Solana gas"
                  : network === "polygon"
                  ? "~0.5% HeroSwap fee · ~$0.01 Polygon gas"
                  : "~0.5% HeroSwap fee · $5–15 Ethereum gas"}
              </p>
            </div>
          )}

          {/* ─── TAB 2: Send USDC ─── */}
          {tab === "usdc" && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Send directly to your DeSo wallet
              </p>

              {/* Deposit address */}
              {desoPublicKey ? (
                <div>
                  <label className="mb-1.5 block text-xs text-[var(--text-secondary)]">
                    Your deposit address
                  </label>
                  <div className="flex items-center gap-2">
                    <div
                      className="min-w-0 flex-1 rounded-lg px-3 py-2.5"
                      style={{
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border-default)",
                      }}
                    >
                      <p className="truncate font-mono text-xs text-[var(--text-primary)]">
                        {desoPublicKey}
                      </p>
                    </div>
                    <button
                      onClick={handleCopy}
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        copied
                          ? "bg-green-500/20 text-green-400"
                          : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      )}
                      style={{ border: "1px solid var(--border-default)" }}
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          ✓ Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-xl py-6 text-center text-sm text-[var(--text-secondary)]"
                  style={{ background: "var(--bg-elevated)" }}
                >
                  Connect your wallet to see your deposit address
                </div>
              )}

              {/* QR placeholder */}
              <div
                className="flex h-24 items-center justify-center rounded-xl text-xs text-[var(--text-secondary)]"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                QR code — coming soon
              </div>

              {/* Instructions */}
              <div
                className="space-y-2 rounded-xl p-4"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
                  Steps
                </p>
                {[
                  "Copy your deposit address above",
                  "Send USDC from any wallet or exchange",
                  "Recommended networks: ✅ Solana USDC (near-zero fees) · ✅ Polygon USDC (~$0.01 gas) · ⚠️ Ethereum USDC ($5–15 gas — only for $100+)",
                  "DesoDollar (DUSD) will appear in your wallet within 30–90 seconds",
                ].map((step, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/20 text-xs font-bold text-[var(--accent)]">
                      {i + 1}
                    </span>
                    <span className="text-xs leading-relaxed text-[var(--text-secondary)]">
                      {step}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-xs text-[var(--text-secondary)]">
                Min deposit: $5 · Caldera trading: 2% on buys, free on sells
              </p>
            </div>
          )}

          {/* ─── TAB 3: DESO Wallet ─── */}
          {tab === "deso" && (
            <div className="space-y-4">
              {/* Balance display */}
              <div
                className="rounded-xl p-4"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <p className="mb-1 text-xs text-[var(--text-secondary)]">Your DESO balance</p>
                <p className="font-mono text-lg font-semibold text-green-400">
                  {desoBalanceDeso.toFixed(4)} DESO
                </p>
                <p className="font-mono text-sm text-[var(--text-secondary)]">
                  ~${desoBalanceUSD.toFixed(2)}
                </p>
              </div>

              {/* Starter DESO state */}
              {hasStarterDeso && (
                <div className="rounded-xl border border-green-700 bg-green-950 p-4">
                  <p className="mb-1 font-medium text-green-300">
                    🎉 DeSo gave you starter DESO!
                  </p>
                  <p className="text-xs text-green-400">
                    This covers transaction fees. Add $5 or more to start predicting.
                  </p>
                  <button
                    onClick={() => setTab("card")}
                    className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent)]/90"
                  >
                    Add Funds →
                  </button>
                </div>
              )}

              {/* Real DESO state */}
              {hasRealDeso && (
                <div
                  className="rounded-xl p-4"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <p className="text-sm font-medium text-green-400">
                    You have enough DESO to trade!
                  </p>
                  {predictionsAffordable > 0 && (
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      ≈ {predictionsAffordable} prediction
                      {predictionsAffordable !== 1 ? "s" : ""} at $5 each
                    </p>
                  )}
                  <button
                    onClick={onClose}
                    className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent)]/90"
                  >
                    Start Trading →
                  </button>
                </div>
              )}

              {/* No balance state */}
              {!hasRealDeso && !hasStarterDeso && (
                <div
                  className="rounded-xl py-6 text-center text-sm text-[var(--text-secondary)]"
                  style={{ background: "var(--bg-elevated)" }}
                >
                  {desoPublicKey
                    ? "No DESO balance detected. Use the card or USDC options to fund your account."
                    : "Connect your wallet to see your DESO balance."}
                </div>
              )}

              {/* Convert DESO → DUSD (only if they have real DESO) */}
              {hasRealDeso && (
                <div
                  className="rounded-xl p-4 text-sm"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <p className="mb-1 font-medium text-[var(--text-primary)]">
                    Convert DESO → DUSD for stable dollar bets
                  </p>
                  <p className="mb-3 text-xs text-[var(--text-secondary)]">
                    DUSD is pegged to $1 USD. Protects your balance from DESO price
                    volatility.
                  </p>
                  <iframe
                    src={`https://heroswap.com/embed?depositTicker=DESO&receiveTicker=DUSD&receiveAddress=${desoPublicKey}`}
                    width="100%"
                    height="340"
                    style={{ border: "none", borderRadius: "10px" }}
                    allow="clipboard-write"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    title="HeroSwap DESO to DUSD"
                  />
                </div>
              )}
            </div>
          )}

          {/* ─── Fee transparency (all tabs) ─── */}
          <div className="mt-5">
            <button
              onClick={() => setFeesOpen((o) => !o)}
              className="flex w-full items-center justify-between text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              <span>See fee details ▾</span>
              {feesOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>

            {feesOpen && (
              <div
                className="mt-3 space-y-1.5 rounded-xl p-4 text-xs"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {[
                  {
                    label: "Trading (buy)",
                    note: "2% · 1% platform + 1% token auto-buy",
                  },
                  { label: "Deposit via Solana USDC", note: "~0.5%" },
                  { label: "Deposit via Polygon USDC", note: "~0.5%" },
                  { label: "Deposit via Ethereum USDC", note: "$5–15 gas" },
                  { label: "Sell", note: "Free" },
                  { label: "Withdrawal", note: "~0.5% via HeroSwap" },
                  { label: "DeSo transactions", note: "<$0.01" },
                ].map((f) => (
                  <div key={f.label} className="flex justify-between gap-4">
                    <span className="text-[var(--text-primary)]">{f.label}</span>
                    <span className="text-right text-[var(--text-secondary)]">{f.note}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
