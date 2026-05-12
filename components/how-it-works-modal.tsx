"use client";
import { useState, useEffect } from "react";

const STEPS = [
  {
    number: "1",
    title: "Pick a market",
    description:
      "Browse markets on any topic. Pick YES or NO based on what you think will happen.",
    visual: "market",
  },
  {
    number: "2",
    title: "Place a trade",
    description:
      "Connect your DeSo wallet in minutes. We'll cover your first trade with free DESO. Win the prediction, win the payout.",
    visual: "trade",
  },
  {
    number: "3",
    title: "Every market is about a creator",
    description:
      "Every market on Caldera is attached to a creator. Trading buys their coin, automatically.",
    visual: "token",
  },
  {
    number: "4",
    title: "Creators always benefit",
    description:
      "Claimed creators get coins instantly on every trade. Unclaimed creators inherit the full balance when they claim.",
    visual: "earn",
  },
];

export function HowItWorksModal() {
  const [show, setShow] = useState(false);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const seen = localStorage.getItem("caldera_hiw_seen");
    if (!seen) setShow(true);
    setReady(true);
  }, []);

  // Listen for manual trigger from nav
  useEffect(() => {
    const handler = () => {
      setStep(0);
      setShow(true);
    };
    window.addEventListener("show-hiw-modal", handler);
    return () => window.removeEventListener("show-hiw-modal", handler);
  }, []);

  const dismiss = () => {
    localStorage.setItem("caldera_hiw_seen", "1");
    setStep(0);
    setShow(false);
  };

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  };

  if (!ready || !show) return null;

  const current = STEPS[step];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        className="relative w-full overflow-hidden border border-border-subtle bg-[var(--bg-surface)] rounded-t-2xl animate-slide-up sm:max-w-sm sm:rounded-2xl sm:animate-none"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Drag handle — mobile only */}
        <div className="sm:hidden mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-text-muted/30" />
        {/* Visual area */}
        <div className="bg-[var(--bg-elevated)] p-8 flex items-center justify-center min-h-[220px] relative">

          {current.visual === "market" && (
            <div className="bg-[var(--bg-surface)] rounded-2xl p-5 w-full max-w-[260px] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-3 mb-4">
                <img
                  src="/api/avatar/BC1YLh2JrNMXmkerRRa7UgeqGgvcAbQ96rtfJHkVXkmafNNdfsHZDPZ"
                  className="w-10 h-10 rounded-full object-cover"
                  loading="lazy"
                  alt="realdonaldtrump"
                />
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">realdonaldtrump</div>
                  <div className="text-xs text-[var(--text-tertiary)]">392 holders</div>
                </div>
              </div>
              <div className="text-sm font-medium text-[var(--text-primary)] leading-snug mb-3">
                Will Trump pardon himself before 2028?
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">71%</span>
                <span className="text-xs text-[var(--text-tertiary)]">chance</span>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 bg-green-500 text-white text-sm font-medium py-2 rounded-xl">
                  YES 71¢
                </button>
                <button className="flex-1 bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm font-medium py-2 rounded-xl border border-[var(--border-subtle)]">
                  NO 29¢
                </button>
              </div>
            </div>
          )}

          {current.visual === "trade" && (
            <div className="bg-[var(--bg-surface)] rounded-2xl p-5 w-full max-w-[240px] border border-[var(--border-subtle)]">
              <div className="text-xs text-[var(--text-tertiary)] mb-1">Buying YES shares</div>
              <div className="text-4xl font-semibold text-[var(--text-primary)] mb-1">$50</div>
              <div className="h-px bg-[var(--border-subtle)] my-3" />
              <div className="flex justify-between text-sm mb-1">
                <span className="text-[var(--text-tertiary)]">Shares</span>
                <span className="font-medium text-[var(--text-primary)]">74.6</span>
              </div>
              <div className="flex justify-between text-sm mb-4">
                <span className="text-[var(--text-tertiary)]">Pays if correct</span>
                <span className="font-medium text-green-500">$74.60</span>
              </div>
              <button className="w-full bg-green-500 text-white text-sm font-medium py-2.5 rounded-xl">
                Buy YES
              </button>
            </div>
          )}

          {current.visual === "token" && (
            <div className="bg-[var(--bg-surface)] rounded-2xl p-5 w-full max-w-[260px] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-3 mb-4">
                <img
                  src="/api/avatar/BC1YLhbhbNctADcV4AZDFk2NtAGWrfPytryAZsZoTA1KGme7EcNZbTH"
                  className="w-11 h-11 rounded-full object-cover"
                  loading="lazy"
                  alt="lebronjames"
                />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">$lebronjames</div>
                  <div className="text-xs text-[var(--text-tertiary)]">1,573 holders</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">$1.46</div>
                  <div className="text-xs text-green-500">▲ 3.2%</div>
                </div>
              </div>
              {/* Caldera-purple accent row — 'this is what makes us different'.
                  Pulse dot signals the buyback is live / active. */}
              <div className="flex items-center gap-2 rounded-lg border border-caldera/20 bg-caldera/5 px-3 py-2">
                <span className="h-1.5 w-1.5 rounded-full bg-caldera animate-pulse shrink-0" />
                <span className="text-xs text-text-primary">
                  1% of every trade buys $lebronjames
                </span>
              </div>
            </div>
          )}

          {current.visual === "earn" && (
            <div className="bg-[var(--bg-surface)] rounded-2xl p-5 w-full max-w-[280px] border border-[var(--border-subtle)]">
              {/* Header — TRADE label + total */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  TRADE
                </span>
                <span className="text-sm font-semibold text-text-primary">$100</span>
              </div>
              <div className="my-3 h-px bg-border-subtle" />
              {/* Fee split — caldera row is the differentiator */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-caldera shrink-0" />
                    <span className="text-xs text-text-primary">
                      Buys $lebronjames coin
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-caldera">$1.00</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-text-muted/40 shrink-0" />
                    <span className="text-xs text-text-muted">Caldera platform</span>
                  </div>
                  <span className="text-xs text-text-muted">$1.00</span>
                </div>
              </div>
              <div className="my-3 h-px bg-border-subtle" />
              <p className="text-[11px] text-text-muted leading-relaxed">
                Coins accumulate in $lebronjames&apos; wallet on every trade. LeBron inherits the full balance when he claims his profile.
              </p>
            </div>
          )}

          {/* Close button */}
          <button
            onClick={dismiss}
            className="absolute top-3 right-3 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--bg-surface)] transition-colors text-lg"
          >
            ×
          </button>
        </div>

        {/* Content area */}
        <div className="p-6">
          <div className="text-xs text-[var(--text-tertiary)] font-medium tracking-widest uppercase mb-1">
            Step {current.number} of {STEPS.length}
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{current.title}</h2>
          <p className="text-sm text-[var(--text-tertiary)] leading-relaxed mb-6">
            {current.description}
          </p>

          {/* Progress dots */}
          <div className="flex items-center gap-2 mb-4 justify-center">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step
                    ? "w-6 bg-[var(--text-primary)]"
                    : "w-1.5 bg-[var(--text-tertiary)]/30"
                }`}
              />
            ))}
          </div>

          {/* Next / Get Started button */}
          <button
            onClick={next}
            className="w-full bg-[var(--accent)] text-white py-3 rounded-xl font-medium text-sm hover:opacity-90 transition-opacity"
          >
            {step < STEPS.length - 1 ? "Next" : "Get Started →"}
          </button>
        </div>
      </div>
    </div>
  );
}
