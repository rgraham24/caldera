"use client";
import { useState, useEffect } from "react";

const STEPS = [
  {
    number: "1",
    title: "Pick a market",
    description:
      "Browse markets on any topic. Pick YES or NO based on what you think will happen. Odds shift in real time as others trade.",
    visual: "market",
  },
  {
    number: "2",
    title: "Place a trade",
    description:
      "Connect your wallet in minutes and get free DESO to start trading right away. Pick YES or NO — if correct, it pays out at resolution.",
    visual: "trade",
  },
  {
    number: "3",
    title: "Every person has a token",
    description:
      "Every public figure on Caldera has a real token. When markets are traded, 1% of every fee automatically buys back that token.",
    visual: "token",
  },
  {
    number: "4",
    title: "Fees flow back into tokens",
    description:
      "Hold any token on Caldera. As markets about that person are traded, fees automatically buy back that token — on every single trade.",
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
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className="relative z-[201] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl w-full max-w-[360px] overflow-hidden">
        {/* Visual area */}
        <div className="bg-[var(--bg-elevated)] p-8 flex items-center justify-center min-h-[220px] relative">

          {current.visual === "market" && (
            <div className="bg-[var(--bg-surface)] rounded-2xl p-5 w-full max-w-[260px] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-3 mb-4">
                <img
                  src="https://node.deso.org/api/v0/get-single-profile-picture/BC1YLh2JrNMXmkerRRa7UgeqGgvcAbQ96rtfJHkVXkmafNNdfsHZDPZ?fallback=https://i.imgur.com/w1BEqJv.png"
                  className="w-10 h-10 rounded-full object-cover"
                  alt="realdonaldtrump"
                />
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">realdonaldtrump</div>
                  <div className="text-xs text-[var(--text-tertiary)]">392 holders</div>
                </div>
              </div>
              <div className="text-sm font-medium text-[var(--text-primary)] leading-snug mb-3">
                Will Trump sign a new executive order on tariffs before May 1?
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">71%</span>
                <span className="text-xs text-[var(--text-tertiary)]">chance YES</span>
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
            <div className="bg-[var(--bg-surface)] rounded-2xl p-5 w-full max-w-[260px] border border-[var(--border-subtle)]">
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
              <button className="w-full bg-green-500 text-white text-sm font-medium py-2.5 rounded-xl whitespace-nowrap">
                Buy YES
              </button>
            </div>
          )}

          {current.visual === "token" && (
            <div className="bg-[var(--bg-surface)] rounded-2xl p-5 w-full max-w-[260px] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-3 mb-4">
                <img
                  src="https://node.deso.org/api/v0/get-single-profile-picture/BC1YLhbhbNctADcV4AZDFk2NtAGWrfPytryAZsZoTA1KGme7EcNZbTH?fallback=https://i.imgur.com/w1BEqJv.png"
                  className="w-11 h-11 rounded-full object-cover"
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
              <div className="bg-[var(--bg-elevated)] rounded-xl px-3 py-3">
                <div className="text-xs text-[var(--text-tertiary)] mb-1">Latest buyback</div>
                <div className="text-sm font-medium text-[var(--text-primary)]">🔄 $0.87 auto-buyback</div>
                <div className="text-xs text-[var(--text-tertiary)] mt-0.5">triggered by a market trade</div>
              </div>
            </div>
          )}

          {current.visual === "earn" && (
            <div className="w-full max-w-[280px] space-y-2.5">
              <div className="bg-[var(--bg-surface)] rounded-xl px-4 py-3 border border-[var(--border-subtle)]">
                <div className="text-xs text-[var(--text-tertiary)] mb-0.5">Someone trades</div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">$100 on a LeBron market</div>
              </div>
              <div className="text-center text-[var(--text-tertiary)]">↓</div>
              <div className="bg-[var(--bg-surface)] rounded-xl px-4 py-3 border border-[var(--border-subtle)] space-y-1">
                <div className="text-xs text-[var(--text-tertiary)]">2% fee splits</div>
                <div className="text-sm font-medium text-green-500">$1 → buys back $lebronjames</div>
                <div className="text-sm text-[var(--text-tertiary)]">$1 → platform</div>
              </div>
              <div className="text-center text-[var(--text-tertiary)]">↓</div>
              <div className="bg-[var(--bg-elevated)] rounded-xl px-4 py-3 border border-[var(--border-subtle)]">
                <div className="text-xs font-medium text-[var(--text-primary)] text-center leading-relaxed">
                  Token buyback happens automatically<br />on every single trade
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
