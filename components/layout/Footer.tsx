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
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
          {/* Left */}
          <div>
            <p className="mb-2 text-base font-semibold text-[var(--text-primary)]">Caldera</p>
            <p className="mb-4 text-sm text-[var(--text-secondary)]">
              The prediction market for everything.
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">© 2026 Caldera</p>
          </div>

          {/* Middle */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
              Navigation
            </p>
            <div className="space-y-2.5">
              {[
                { href: "/markets", label: "Markets" },
                { href: "/creators", label: "Tokens" },
                { href: "/leaderboard", label: "Leaderboard" },
                { href: "/how-it-works", label: "How It Works" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Right */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
              Risk Disclosure
            </p>
            <p className="text-sm leading-relaxed text-[var(--text-tertiary)]">
              Caldera is a prediction market platform. Token activity reflects platform fee mechanics. Token prices may go up or down. Not financial advice.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
