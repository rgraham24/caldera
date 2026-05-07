"use client";
import Link from "next/link";
import { useState } from "react";

const NAV_LINKS = [
  { href: "/markets", label: "Markets" },
  { href: "/creators", label: "Coins" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function Footer() {
  const [expanded, setExpanded] = useState(false);
  return (
    <footer
      className="border-t border-[var(--border-subtle)] py-12 px-6"
      style={{ background: "var(--bg-surface)" }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          {/* Brand */}
          <div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <circle cx="11" cy="11" r="10" stroke="rgba(255,255,255,0.14)" strokeWidth="0.8" />
                  <circle cx="11" cy="11" r="6.5" stroke="rgba(124,92,252,0.45)" strokeWidth="0.6" />
                  <circle cx="11" cy="11" r="2.5" fill="#7C5CFC" />
                </svg>
                <span style={{ fontFamily: "var(--font-dm-serif)", fontSize: "17px", color: "#fff", lineHeight: 1 }}>
                  Caldera
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]" style={{ letterSpacing: "0.04em" }}>
                Trade what you know. Own what you love.
              </p>
            </div>
          </div>

          {/* Navigation */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
              Navigation
            </p>
            <div className="space-y-2.5">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  {link.label}
                </Link>
              ))}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  window.dispatchEvent(new CustomEvent("show-hiw-modal"));
                }}
                className="block text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] text-left"
              >
                How It Works
              </button>
            </div>
          </div>

          {/* Community */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
              Community
            </p>
            <div className="space-y-2.5">
              <a
                href="https://x.com/CalderaMarket"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.259 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                X / Twitter
              </a>
              <Link
                href="/about"
                className="block text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                About
              </Link>
              <Link
                href="/terms"
                className="block text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                Terms of Service
              </Link>
            </div>
          </div>

          {/* Risk Disclosure (collapsed summary + expander) */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
              Risk Disclosure
            </p>
            <p className="text-sm leading-relaxed text-[var(--text-tertiary)]">
              Caldera is a prediction market on DeSo. Trading involves risk;
              you may lose your funds. Coin purchases don&apos;t guarantee
              returns.
            </p>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-3 text-xs font-medium text-[var(--text-secondary)] underline-offset-2 transition-colors hover:text-[var(--text-primary)] hover:underline"
            >
              {expanded ? "Hide details ▲" : "Show details ▼"}
            </button>
          </div>
        </div>

        {/* Copyright row */}
        <div
          className="mt-10 border-t border-[var(--border-subtle)] pt-6 text-xs text-[var(--text-tertiary)]"
        >
          © 2026 Caldera
        </div>

        {/* Full disclosure — full-width, only when expanded */}
        {expanded && (
          <div className="mt-6 rounded-lg border border-[var(--border-subtle)] p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
              Full Risk Disclosure
            </p>
            <p className="text-sm leading-relaxed text-[var(--text-tertiary)]">
              Caldera is a prediction market platform on the DeSo blockchain. A
              2% fee applies to every buy trade (sells are free): 1% funds
              platform operations, 1% is used to buy the market&apos;s
              creator&apos;s coin on DeSo. For claimed creators, the bought
              coins are sent directly to the creator&apos;s wallet on every
              trade; for unclaimed creators, coins are held in the platform
              wallet until the creator joins and claims their profile. No coin
              supply is burned or removed from circulation. Never trade more
              than you can afford to lose. Not financial advice. Coin purchases
              do not constitute a promise of financial return. Coin values may
              decrease. Past trading activity does not guarantee future price
              appreciation.
            </p>
          </div>
        )}
      </div>
    </footer>
  );
}
