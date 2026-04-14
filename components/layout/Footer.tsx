"use client";
import Link from "next/link";

export function Footer() {
  return (
    <footer
      className="py-12 px-6"
      style={{
        background: "var(--bg-surface)",
        borderTop: "1px solid var(--border-subtle)",
      }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          {/* Brand */}
          <div>
            <p className="mb-2 text-base font-semibold text-[var(--text-primary)]">Caldera</p>
            <p className="mb-4 text-sm text-[var(--text-secondary)]">
              The prediction market for everything.
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">© 2026 Caldera</p>
          </div>

          {/* Navigation */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
              Navigation
            </p>
            <div className="space-y-2.5">
              {[
                { href: "/markets", label: "Markets" },
                { href: "/creators", label: "Tokens" },
                { href: "/leaderboard", label: "Leaderboard" },
              ].map((link) => (
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
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.259 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                X / Twitter
              </a>
              {/* Discord link hidden until server is created */}
              {false && (
                <a
                  href="https://discord.gg/caldera"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.101 18.08.114 18.102.13 18.115a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                  </svg>
                  Discord
                </a>
              )}
              <Link href="/about" className="block text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
                About
              </Link>
              <Link href="/terms" className="block text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
                Terms of Service
              </Link>
            </div>
          </div>

          {/* Risk Disclosure */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
              Risk Disclosure
            </p>
            <p className="text-sm leading-relaxed text-[var(--text-tertiary)]">
              Caldera charges 2% on buys. Sells are always free. 1% of every fee auto-buys the associated token. Not financial advice.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
