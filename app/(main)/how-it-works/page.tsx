import Link from "next/link";

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:px-6 lg:px-8">
      {/* Hero */}
      <h1 className="font-display text-4xl font-bold tracking-tight text-text-primary md:text-5xl">
        How Caldera Works
      </h1>
      <p className="mt-3 text-lg text-text-muted">
        Predict anything. Own the token. Watch it move.
      </p>

      <div className="mt-12 space-y-8">
        {/* Section 1 — Predict */}
        <section className="rounded-2xl border border-border-subtle/30 bg-surface p-6">
          <div className="mb-4 text-3xl">🎯</div>
          <h2 className="mb-3 font-display text-2xl font-bold text-text-primary">Predict</h2>
          <p className="mb-4 text-sm text-text-muted leading-relaxed">
            Pick YES or NO on any outcome — sports, politics, culture, tech, anything. Get it right and win.
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

        {/* Section 2 — Own the Token */}
        <section className="rounded-2xl border border-border-subtle/30 bg-surface p-6">
          <div className="mb-4 text-3xl">💎</div>
          <h2 className="mb-3 font-display text-2xl font-bold text-text-primary">Own the Token</h2>
          <p className="mb-4 text-sm text-text-muted leading-relaxed">
            Every market has a real token behind it. Buy it, hold it, and watch prediction fees flow back into that token automatically.
          </p>
          <div className="mb-4 rounded-xl border border-caldera/20 bg-caldera/5 p-4">
            <p className="mb-1 text-xs font-semibold text-caldera">Example</p>
            <p className="text-sm text-text-primary">
              $100,000 trades on Tiger Woods markets → $750 flows back into $tigerwoods automatically.
            </p>
            <p className="mt-2 text-xs text-text-muted">
              No action required. Just hold the token.
            </p>
          </div>
          <p className="text-sm text-text-muted leading-relaxed">
            The more people predict about someone, the more the token moves. Tokens are stored on-chain — buy them directly on Caldera from each creator&apos;s profile page.
          </p>
        </section>

        {/* Section 3 — Claiming Your Profile */}
        <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
          <div className="mb-4 text-3xl">🏆</div>
          <h2 className="mb-3 font-display text-2xl font-bold text-text-primary">Are you on here? Come get your money.</h2>
          <p className="mb-4 text-sm text-text-muted leading-relaxed">
            If you&apos;re a public figure, creator, or athlete with a Caldera profile, your account is already here.
            Claim it and <span className="font-semibold text-amber-400">receive 0.75% of every prediction about you</span>.
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
              <p className="text-[10px] text-text-muted">One public post</p>
            </div>
            <div className="flex-1 rounded-xl bg-background p-3 text-center">
              <p className="text-xl">3️⃣</p>
              <p className="mt-1 text-xs font-medium text-text-primary">Receive your fee share</p>
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

      {/* Fee table */}
      <section className="mt-8 rounded-2xl border border-border-subtle/30 bg-surface p-6">
        <div className="mb-4 text-3xl">💸</div>
        <h2 className="mb-3 font-display text-2xl font-bold text-text-primary">Fees</h2>
        <div className="overflow-hidden rounded-xl border border-border-subtle/30">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-2">
                <th className="px-4 py-2.5 text-left font-medium text-text-muted">Action</th>
                <th className="px-4 py-2.5 text-right font-medium text-text-muted">Fee</th>
              </tr>
            </thead>
            <tbody>
              {[
                { action: "Buy YES/NO", fee: "2%", highlight: false },
                { action: "Sell", fee: "Free", highlight: true },
                { action: "Deposit (Solana USDC)", fee: "~0.5%", highlight: false },
                { action: "Withdraw", fee: "~0.5%", highlight: false },
              ].map((row) => (
                <tr key={row.action} className="border-b border-border-subtle/30 last:border-0">
                  <td className="px-4 py-2.5 text-text-primary">{row.action}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${row.highlight ? "text-yes" : "text-text-primary"}`}>
                    {row.fee}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 rounded-xl border border-caldera/20 bg-caldera/5 p-4 space-y-1.5 text-sm text-text-muted">
          <p className="font-semibold text-text-primary text-xs uppercase tracking-widest">How the 2% is split</p>
          <p>1% funds Caldera&apos;s operations.</p>
          <p>1% is used to automatically purchase that creator or team&apos;s token on the DeSo blockchain — creating real buy pressure every time someone trades.</p>
          <p className="text-yes text-xs font-medium pt-1">Sells are always free. No penalty for exiting.</p>
        </div>
      </section>

      {/* FAQ */}
      <div className="mt-16">
        <h2 className="mb-6 font-display text-2xl font-bold text-text-primary">FAQ</h2>
        <div className="space-y-4">
          {[
            {
              q: "Do I need crypto to use Caldera?",
              a: "You need a wallet to trade. Setting one up is free and takes 2 minutes.",
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
              a: "Tokens are on-chain assets tied to creators and public figures. Prediction fees flow back into them automatically based on market activity.",
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
