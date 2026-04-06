import Link from "next/link";

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:px-6 lg:px-8">
      {/* Hero */}
      <h1 className="font-display text-4xl font-bold tracking-tight text-text-primary md:text-5xl">
        How Caldera Works
      </h1>
      <p className="mt-3 text-lg text-text-muted">
        Three things. That's it.
      </p>

      <div className="mt-12 space-y-8">
        {/* Section 1 — Making Predictions */}
        <section className="rounded-2xl border border-border-subtle/30 bg-surface p-6">
          <div className="mb-4 text-3xl">🎯</div>
          <h2 className="mb-3 font-display text-2xl font-bold text-text-primary">Making Predictions</h2>
          <p className="mb-4 text-sm text-text-muted leading-relaxed">
            Pick YES or NO on real events. Prices tell you the odds — if YES costs 72¢, the market thinks there&apos;s a 72% chance it happens.
          </p>
          <div className="mb-4 flex gap-3">
            <div className="flex-1 rounded-xl bg-yes/10 p-4 text-center">
              <p className="font-display text-2xl font-bold text-yes">YES 72%</p>
              <p className="mt-1 text-xs text-text-muted">Buy at 72¢ → win $1</p>
              <p className="mt-0.5 text-[10px] text-yes/70">39% profit if correct</p>
            </div>
            <div className="flex-1 rounded-xl bg-no/10 p-4 text-center">
              <p className="font-display text-2xl font-bold text-no">NO 28%</p>
              <p className="mt-1 text-xs text-text-muted">Buy at 28¢ → win $1</p>
              <p className="mt-0.5 text-[10px] text-no/70">257% profit if correct</p>
            </div>
          </div>
          <p className="text-sm text-text-muted leading-relaxed">
            If you&apos;re wrong, your shares are worth $0 at resolution. Each market has a clear resolution source — court records, official stats, or public announcements. No ambiguity.
          </p>
        </section>

        {/* Section 2 — Token Holder Earnings */}
        <section className="rounded-2xl border border-border-subtle/30 bg-surface p-6">
          <div className="mb-4 text-3xl">💎</div>
          <h2 className="mb-3 font-display text-2xl font-bold text-text-primary">Hold Tokens. Earn Passively.</h2>
          <p className="mb-4 text-sm text-text-muted leading-relaxed">
            Every creator on Caldera has a token. Holding it earns you a share of every trade on that creator&apos;s markets — automatically, forever.
          </p>
          <div className="mb-4 rounded-xl border border-caldera/20 bg-caldera/5 p-4">
            <p className="mb-1 text-xs font-semibold text-caldera">Example</p>
            <p className="text-sm text-text-primary">
              $10,000 traded on Tiger Woods markets this week.
            </p>
            <p className="text-sm text-text-primary">
              You hold 10% of the $tigerwoods supply → you earn{" "}
              <span className="font-bold text-yes">$15 automatically</span>.
            </p>
            <p className="mt-2 text-xs text-text-muted">
              No work required. Just hold the token.
            </p>
          </div>
          <p className="text-sm text-text-muted leading-relaxed">
            This isn&apos;t speculation on token price — it&apos;s passive income from prediction activity. The more people predict about someone, the more token holders earn.
          </p>
        </section>

        {/* Section 3 — Claiming Your Profile */}
        <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
          <div className="mb-4 text-3xl">🏆</div>
          <h2 className="mb-3 font-display text-2xl font-bold text-text-primary">Are you on here? Come get your money.</h2>
          <p className="mb-4 text-sm text-text-muted leading-relaxed">
            If you&apos;re a public figure, creator, or athlete with a DeSo account, your profile is already on Caldera.
            Claim it and earn <span className="font-semibold text-amber-400">0.75% of every prediction about you</span>.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1 rounded-xl bg-background p-3 text-center">
              <p className="text-xl">1️⃣</p>
              <p className="mt-1 text-xs font-medium text-text-primary">Find your profile</p>
              <p className="text-[10px] text-text-muted">Search on Caldera</p>
            </div>
            <div className="flex-1 rounded-xl bg-background p-3 text-center">
              <p className="text-xl">2️⃣</p>
              <p className="mt-1 text-xs font-medium text-text-primary">Post a verification code</p>
              <p className="text-[10px] text-text-muted">One post on DeSo</p>
            </div>
            <div className="flex-1 rounded-xl bg-background p-3 text-center">
              <p className="text-xl">3️⃣</p>
              <p className="mt-1 text-xs font-medium text-text-primary">Start earning</p>
              <p className="text-[10px] text-text-muted">0.75% of every trade</p>
            </div>
          </div>
          <div className="mt-4">
            <Link
              href="/creators"
              className="inline-block rounded-xl bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-400 hover:bg-amber-500/30 transition-colors"
            >
              Find your profile →
            </Link>
          </div>
        </section>
      </div>

      {/* FAQ */}
      <div className="mt-16">
        <h2 className="mb-6 font-display text-2xl font-bold text-text-primary">FAQ</h2>
        <div className="space-y-4">
          {[
            {
              q: "Do I need crypto to use Caldera?",
              a: "You need a DeSo wallet to trade. Setting one up is free and takes 2 minutes.",
            },
            {
              q: "How do markets resolve?",
              a: "Each market has a clear resolution source listed — court records, official stats, public announcements. No ambiguity.",
            },
            {
              q: "Can I lose money?",
              a: "Yes — if your prediction is wrong, your shares are worth $0. Never predict more than you can afford to lose.",
            },
            {
              q: "What are tokens?",
              a: "Tokens are on the DeSo blockchain. Holding them earns you a share of trading fees from prediction markets about that person.",
            },
          ].map((item) => (
            <div key={item.q} className="rounded-xl border border-border-subtle/30 bg-surface p-4">
              <p className="mb-1 font-medium text-text-primary text-sm">Q: {item.q}</p>
              <p className="text-sm text-text-muted">A: {item.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="mt-12 text-center">
        <Link
          href="/markets"
          className="inline-block rounded-xl bg-caldera px-8 py-3 text-sm font-semibold text-background hover:bg-caldera/90 transition-colors"
        >
          Start Trading →
        </Link>
      </div>
    </div>
  );
}
