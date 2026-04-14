import Link from "next/link";

export const metadata = {
  title: "About Caldera — Predict. Trade. Burn.",
};

const CATEGORY_TOKENS = [
  { symbol: "$SPORTS", slug: "caldera-sports", description: "Every sports market on Caldera" },
  { symbol: "$MUSIC", slug: "caldera-music", description: "Music, artists & album drops" },
  { symbol: "$POLITICS", slug: "caldera-politics", description: "Elections, policy & world events" },
  { symbol: "$ENTERTAINMENT", slug: "caldera-entertainment", description: "Film, TV & celebrity culture" },
  { symbol: "$TECH", slug: "caldera-tech", description: "Crypto, AI & company markets" },
  { symbol: "$CLIMATE", slug: "caldera-climate", description: "Climate policy & clean energy" },
];

const FEATURES = [
  {
    icon: "🔥",
    title: "Prediction markets for internet culture",
    body: "Binary YES/NO markets on everything that matters right now — creators, athletes, politicians, crypto. If people are talking about it, there's a market.",
  },
  {
    icon: "⛓️",
    title: "Built on DeSo blockchain",
    body: "Every trade is an on-chain transaction. Transparent, auditable, and not controlled by any single company. Your positions and PnL are verifiable on-chain.",
  },
  {
    icon: "🪙",
    title: "Every market burns tokens",
    body: "1% of every trade fee auto-buys the associated category or creator token and burns it permanently. Real trading volume = real token deflation.",
  },
  {
    icon: "📊",
    title: "Real money, real stakes",
    body: "No play-money. Trades are real DeSo blockchain transactions. Win or lose, the stakes are real — which is exactly what makes the signal valuable.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6 lg:px-8">

      {/* Hero */}
      <div className="mb-20 text-center">
        <h1 className="mb-4 font-display text-5xl font-bold tracking-tight text-text-primary sm:text-6xl">
          Predict. Trade.{" "}
          <span className="text-caldera">Burn.</span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-text-muted">
          The prediction market where every trade makes tokens more scarce and creators earn forever.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/markets"
            className="rounded-xl bg-caldera px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Browse Markets
          </Link>
          <Link
            href="/leaderboard"
            className="rounded-xl border border-border-subtle bg-surface px-6 py-3 text-sm font-semibold text-text-primary transition-colors hover:border-caldera/40"
          >
            Leaderboard
          </Link>
        </div>
      </div>

      {/* How it works */}
      <div className="mb-20">
        <h2 className="mb-8 font-display text-2xl font-bold text-text-primary">
          How it works
        </h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border-subtle bg-surface p-5"
            >
              <div className="mb-3 text-3xl">{f.icon}</div>
              <h3 className="mb-2 font-semibold text-text-primary">{f.title}</h3>
              <p className="text-sm leading-relaxed text-text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Token mechanics */}
      <div className="mb-20 rounded-2xl border border-border-subtle bg-surface p-6 md:p-8">
        <h2 className="mb-2 font-display text-2xl font-bold text-text-primary">
          The token mechanic
        </h2>
        <p className="mb-8 text-text-muted">
          Every market on Caldera is linked to either a category token or an
          individual creator token. Here&apos;s why that matters.
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-border-subtle/50 bg-surface-2 p-5">
            <h3 className="mb-2 font-semibold text-text-primary">
              Category tokens — index-level exposure
            </h3>
            <p className="text-sm leading-relaxed text-text-muted">
              Hold <span className="font-mono text-caldera">$SPORTS</span> or{" "}
              <span className="font-mono text-caldera">$ENTERTAINMENT</span> and
              benefit from every trade across that entire category. Every prediction
              market in the category burns a tiny slice of that token — the more
              active the category, the more deflationary the pressure.
            </p>
          </div>
          <div className="rounded-xl border border-border-subtle/50 bg-surface-2 p-5">
            <h3 className="mb-2 font-semibold text-text-primary">
              Creator tokens — True Believer status
            </h3>
            <p className="text-sm leading-relaxed text-text-muted">
              Hold a creator&apos;s token like{" "}
              <span className="font-mono text-caldera">$KAICENAT</span> and appear
              on their leaderboard as a True Believer. Every time someone trades
              a market about that creator, a fraction burns. The earlier you hold,
              the more you benefit from growing market activity.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-caldera/20 bg-caldera/5 p-4">
          <p className="text-sm text-text-muted">
            <span className="font-semibold text-caldera">Buy &amp; burn</span> — 1% of
            every trade fee is used to buy the associated token on the open market
            and permanently remove it from circulation. No team allocation, no vesting
            cliff. Supply decreases with every single trade.
          </p>
        </div>
      </div>

      {/* Category tokens grid */}
      <div className="mb-20">
        <h2 className="mb-8 font-display text-2xl font-bold text-text-primary">
          Category tokens
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORY_TOKENS.map((t) => (
            <Link
              key={t.symbol}
              href={`/profile/${t.slug}`}
              className="flex items-center gap-4 rounded-2xl border border-border-subtle bg-surface p-4 transition-colors hover:border-caldera/40 hover:bg-surface-2"
            >
              <span className="font-mono text-lg font-bold text-caldera">
                {t.symbol}
              </span>
              <span className="text-sm text-text-muted">{t.description}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* DeSo explainer */}
      <div className="mb-20 rounded-2xl border border-border-subtle bg-surface p-6 md:p-8">
        <h2 className="mb-2 font-display text-2xl font-bold text-text-primary">
          Why DeSo?
        </h2>
        <p className="mb-4 text-text-muted">
          DeSo is a layer-1 blockchain built specifically for social applications.
          It gives Caldera native creator coin primitives, on-chain social graph
          data, and fast transaction finality — without needing to bridge assets
          or manage wallets on a general-purpose chain.
        </p>
        <ul className="space-y-2 text-sm text-text-muted">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-caldera">✓</span>
            <span>Every trade is verifiable on-chain — no black boxes</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-caldera">✓</span>
            <span>Creator coins are native to the protocol, not smart contracts</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-caldera">✓</span>
            <span>DeSo Identity — one login for the entire DeSo ecosystem</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-caldera">✓</span>
            <span>Sub-cent transaction fees — practical for small-dollar predictions</span>
          </li>
        </ul>
      </div>

      {/* CTA */}
      <div className="rounded-2xl border border-caldera/20 bg-caldera/5 p-8 text-center">
        <h2 className="mb-3 font-display text-2xl font-bold text-text-primary">
          Ready to trade?
        </h2>
        <p className="mb-6 text-text-muted">
          Connect your DeSo wallet and start predicting. Every correct call builds
          your on-chain reputation.
        </p>
        <Link
          href="/login"
          className="inline-block rounded-xl bg-caldera px-8 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Connect Wallet
        </Link>
      </div>

    </div>
  );
}
