"use client";
import { useState, useEffect } from "react";

const STEPS = [
  {
    number: "1",
    title: "Pick a market",
    description:
      "Browse markets on any topic. Buy YES or NO shares based on what you think will happen. Odds shift in real time as traders join.",
    visual: "market",
  },
  {
    number: "2",
    title: "Place a trade",
    description:
      "Connect your DeSo wallet in minutes — it's free. Buy YES or NO shares at the current price. If your prediction is correct, shares pay out at resolution.",
    visual: "trade",
  },
  {
    number: "3",
    title: "Every market has a token",
    description:
      "Every person and entity on Caldera has a real token on the DeSo blockchain. When markets are traded, 1% of every fee automatically buys that token on-chain.",
    visual: "token",
  },
  {
    number: "4",
    title: "Fees flow back into tokens",
    description:
      "Hold any token on Caldera. As markets about that person or entity are traded, fees automatically buy that token — creating on-chain buy pressure with every trade.",
    visual: "earn",
  },
];

export function HowItWorksModal() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Show to first-time visitors after 1.5s delay
    const seen = localStorage.getItem("caldera_hiw_seen");
    if (!seen) {
      const timer = setTimeout(() => setShow(true), 1500);
      return () => clearTimeout(timer);
    }
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
    setShow(false);
  };

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  };

  if (!show) return null;

  const current = STEPS[step];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl w-full max-w-sm overflow-hidden">
        {/* Visual area */}
        <div className="bg-[var(--bg-elevated)] p-8 flex items-center justify-center min-h-[220px] relative">

          {current.visual === "market" && (
            <div className="relative">
              <div className="bg-[var(--bg-surface)] rounded-2xl p-5 w-full max-w-[260px] border border-[var(--border-subtle)]">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400">
                    LIVE
                  </span>
                  <span className="text-xs text-[var(--text-tertiary)]">14 days left</span>
                </div>
                <div className="text-sm font-medium text-[var(--text-primary)] leading-snug mb-4">
                  Will there be a US recession in 2026?
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl font-semibold text-[var(--text-primary)]">67%</span>
                  <span className="text-xs text-[var(--text-tertiary)]">chance YES</span>
                </div>
                <div className="flex gap-2">
                  <button className="flex-1 bg-green-500 text-white text-sm font-medium py-2 rounded-xl">
                    YES 67¢
                  </button>
                  <button className="flex-1 bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm font-medium py-2 rounded-xl border border-[var(--border-subtle)]">
                    NO 33¢
                  </button>
                </div>
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
                <div className="w-11 h-11 rounded-full bg-purple-500/20 flex items-center justify-center text-sm font-semibold text-purple-400">
                  LJ
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">$lebronjames</div>
                  <div className="text-xs text-[var(--text-tertiary)]">1,573 holders · DeSo</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">$1.46</div>
                  <div className="text-xs text-green-500">▲ 3.2%</div>
                </div>
              </div>
              <div className="bg-[var(--bg-elevated)] rounded-xl p-3">
                <div className="text-xs text-[var(--text-tertiary)] mb-1">Last auto-buy</div>
                <div className="text-sm font-medium text-[var(--text-primary)]">🔄 $0.87 bought just now</div>
                <div className="text-xs text-[var(--text-tertiary)] mt-0.5">from LeBron market trade</div>
              </div>
            </div>
          )}

          {current.visual === "earn" && (
            <div className="w-full max-w-[280px] space-y-2">
              <div className="bg-[var(--bg-surface)] rounded-xl p-3.5 border border-[var(--border-subtle)]">
                <div className="text-xs text-[var(--text-tertiary)] mb-0.5">Trade on any market</div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">$100 trade on LeBron market</div>
              </div>
              <div className="text-center text-[var(--text-tertiary)] text-base leading-none py-0.5">↓</div>
              <div className="bg-[var(--bg-surface)] rounded-xl p-3.5 border border-[var(--border-subtle)]">
                <div className="text-xs text-[var(--text-tertiary)] mb-1">2% fee splits automatically</div>
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-[var(--text-primary)]">$1 → buys $lebronjames</span>
                  <span className="text-[var(--text-tertiary)]">on-chain</span>
                </div>
                <div className="flex justify-between text-xs mt-0.5">
                  <span className="text-[var(--text-tertiary)]">$1 → platform</span>
                </div>
              </div>
              <div className="text-center text-[var(--text-tertiary)] text-base leading-none py-0.5">↓</div>
              <div className="bg-purple-500/10 rounded-xl p-3.5 border border-purple-500/20">
                <div className="text-xs font-medium text-purple-400 text-center">
                  Token auto-bought on every trade · on-chain · automatic
                </div>
              </div>
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
