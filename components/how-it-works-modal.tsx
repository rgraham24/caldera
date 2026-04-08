"use client";
import { useState, useEffect } from "react";

const STEPS = [
  {
    number: "1",
    title: "Pick a market",
    description:
      "Choose any market about a creator, athlete, politician, or world event. Buy YES or NO shares at the current price. Odds shift in real time as other traders join.",
    visual: "market",
  },
  {
    number: "2",
    title: "Place a trade",
    description:
      "Connect your DeSo wallet — it takes 2 minutes and is free to set up. Then buy YES or NO shares. If you're right, each share pays out $1.",
    visual: "trade",
  },
  {
    number: "3",
    title: "Own the token",
    description:
      "Every creator and public figure on Caldera has a real token on the DeSo blockchain. Every time someone trades a market about them, 1% of the fee auto-buys their token.",
    visual: "token",
  },
  {
    number: "4",
    title: "Hold early. Earn more.",
    description:
      "Buy a creator's token before their markets get popular. As trading volume grows, buybacks accumulate — and early holders benefit. This doesn't exist anywhere else.",
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
            <div className="bg-[var(--bg-surface)] rounded-xl p-4 w-full max-w-[260px] shadow-sm border border-[var(--border-subtle)]">
              <div className="text-xs text-[var(--text-tertiary)] mb-2">SPORTS · 14 days left</div>
              <div className="text-sm font-medium text-[var(--text-primary)] mb-3">
                Will LeBron play in the 2026 All-Star game?
              </div>
              <div className="flex gap-2">
                <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
                  <div className="text-xs text-green-500 font-medium">YES</div>
                  <div className="text-base font-semibold text-[var(--text-primary)]">67¢</div>
                </div>
                <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-center">
                  <div className="text-xs text-red-400 font-medium">NO</div>
                  <div className="text-base font-semibold text-[var(--text-primary)]">33¢</div>
                </div>
              </div>
            </div>
          )}

          {current.visual === "trade" && (
            <div className="bg-[var(--bg-surface)] rounded-xl p-4 w-full max-w-[260px] shadow-sm border border-[var(--border-subtle)]">
              <div className="text-sm text-[var(--text-tertiary)] mb-1">Your trade</div>
              <div className="text-3xl font-semibold text-[var(--text-primary)] mb-1">$100</div>
              <div className="text-sm text-green-500 mb-3">To Win $149</div>
              <div className="w-full bg-green-500 text-white text-sm font-medium py-2 rounded-lg text-center">
                Buy YES
              </div>
            </div>
          )}

          {current.visual === "token" && (
            <div className="bg-[var(--bg-surface)] rounded-xl p-4 w-full max-w-[260px] shadow-sm border border-[var(--border-subtle)]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-sm font-semibold text-purple-400">
                  LJ
                </div>
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">$lebronjames</div>
                  <div className="text-xs text-[var(--text-tertiary)]">1,573 holders</div>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">$1.46</div>
                  <div className="text-xs text-green-500">▲ 3.2%</div>
                </div>
              </div>
              <div className="bg-[var(--bg-elevated)] rounded-lg p-2 text-xs text-[var(--text-tertiary)]">
                🔄 1% of every trade fee auto-buys this token
              </div>
            </div>
          )}

          {current.visual === "earn" && (
            <div className="w-full max-w-[280px] space-y-2">
              <div className="bg-[var(--bg-surface)] rounded-lg p-3 border border-[var(--border-subtle)] text-xs text-center text-[var(--text-primary)]">
                Someone trades <span className="font-semibold">$100</span> on LeBron market
              </div>
              <div className="text-center text-[var(--text-tertiary)] text-lg">↓</div>
              <div className="bg-[var(--bg-surface)] rounded-lg p-3 border border-[var(--border-subtle)] text-xs">
                <div className="text-green-500 font-medium">$1 → auto-buys $lebronjames token</div>
                <div className="text-[var(--text-tertiary)]">$1 → platform fee</div>
              </div>
              <div className="text-center text-[var(--text-tertiary)] text-lg">↓</div>
              <div className="bg-purple-500/10 rounded-lg p-3 border border-purple-500/20 text-xs text-center">
                <span className="text-purple-400 font-semibold">Token price rises → early holders profit</span>
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
          <div className="text-xs text-[var(--text-tertiary)] font-medium mb-1">
            {current.number}. step
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
