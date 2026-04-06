import Link from "next/link";

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:px-6 lg:px-8">
      {/* Hero */}
      <h1 className="font-display text-4xl font-bold tracking-tight text-text-primary md:text-5xl">
        How Caldera Works
      </h1>
      <p className="mt-3 text-lg text-text-muted">
        Predict outcomes. Hold creator coins. Earn from every trade.
      </p>

      <div className="mt-12 space-y-16">
        {/* Section 1 */}
        <section className="relative rounded-2xl p-6 -mx-6" style={{ background: "rgba(0, 194, 255, 0.03)" }}>
          <span className="absolute top-2 right-4 font-display text-[180px] font-black leading-none text-text-primary opacity-[0.03] select-none">01</span>
          <h2 className="section-header mb-4">Prediction Markets</h2>
          <div className="space-y-3 text-sm text-text-muted leading-relaxed">
            <p>
              You predict <span className="text-yes font-medium">YES</span> or{" "}
              <span className="text-no font-medium">NO</span> on outcomes about real people —
              will Tiger Woods be convicted? Will Kai Cenat break his subathon record?
            </p>
            <p>
              Prices move as people trade. If 72% of money is on YES, the YES price is 72¢.
              If you bought at 50¢ and it resolves YES, you get $1 per share — a 100% return.
            </p>
            <div className="mt-4 flex gap-3">
              <div className="flex-1 rounded-xl bg-yes/10 p-4 text-center">
                <p className="font-display text-2xl font-bold text-yes">YES 72%</p>
                <p className="mt-1 text-xs text-text-muted">Buy at 72¢, win $1</p>
              </div>
              <div className="flex-1 rounded-xl bg-no/10 p-4 text-center">
                <p className="font-display text-2xl font-bold text-no">NO 28%</p>
                <p className="mt-1 text-xs text-text-muted">Buy at 28¢, win $1</p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2 */}
        <section className="relative rounded-2xl p-6 -mx-6" style={{ background: "rgba(0, 255, 136, 0.03)" }}>
          <span className="absolute top-2 right-4 font-display text-[180px] font-black leading-none text-text-primary opacity-[0.03] select-none">02</span>
          <h2 className="section-header mb-4">Creator Coins</h2>
          <div className="space-y-3 text-sm text-text-muted leading-relaxed">
            <p>
              Every creator on DeSo has a coin tied to their reputation. When you buy{" "}
              <span className="text-caldera font-medium">$tigerwoods</span> or{" "}
              <span className="text-caldera font-medium">$elonmusk</span>, you hold a real
              on-chain asset.
            </p>
            <p>
              <span className="text-text-primary font-medium">Why hold?</span> You earn 0.75%
              of EVERY trade on that creator&apos;s markets — automatically.
            </p>
            <div className="mt-4 rounded-xl border border-caldera/20 bg-caldera/5 p-4">
              <p className="text-xs font-medium text-caldera mb-2">Example</p>
              <p className="text-sm text-text-primary">
                $100,000 trades on Tiger Woods markets → $750 goes to $tigerwoods holders.
              </p>
              <p className="text-sm text-text-primary">
                If you hold 10% of all $tigerwoods coins → you earn <span className="text-yes font-bold">$75</span> automatically.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3 */}
        <section className="relative rounded-2xl p-6 -mx-6" style={{ background: "rgba(255, 170, 0, 0.03)" }}>
          <span className="absolute top-2 right-4 font-display text-[180px] font-black leading-none text-text-primary opacity-[0.03] select-none">03</span>
          <h2 className="section-header mb-4">Claim Your Profile</h2>
          <div className="space-y-3 text-sm text-text-muted leading-relaxed">
            <p>
              If markets are being made about you, claim your profile to earn{" "}
              <span className="text-caldera font-medium">0.75% of every trade</span>.
              Verify by posting a unique code publicly — on X, Instagram, YouTube, anywhere.
            </p>
            <p>
              Unclaimed profiles: the creator&apos;s share goes to coin holders instead.
              Holders earn 1.5% total until the creator claims.
            </p>
          </div>
        </section>

        {/* Section 4 */}
        <section className="relative rounded-2xl p-6 -mx-6" style={{ background: "rgba(139, 92, 246, 0.03)" }}>
          <span className="absolute top-2 right-4 font-display text-[180px] font-black leading-none text-text-primary opacity-[0.03] select-none">04</span>
          <h2 className="section-header mb-4">Your Reputation</h2>
          <div className="space-y-3 text-sm text-text-muted leading-relaxed">
            <p>
              Caldera tracks your prediction accuracy. The leaderboard ranks traders by ROI,
              accuracy, and early call score.
            </p>
            <p>
              Be in the first 20% of traders on a winning market to earn the{" "}
              <span className="text-text-primary font-medium">Called It Early 🔥</span> badge.
            </p>
          </div>
        </section>

        {/* Section 5 — $CALDRA */}
        <section className="relative rounded-2xl p-6 -mx-6" style={{ background: "rgba(0, 194, 255, 0.05)" }}>
          <span className="absolute top-2 right-4 font-display text-[180px] font-black leading-none text-text-primary opacity-[0.03] select-none">05</span>
          <h2 className="section-header mb-4">Two Ways to Earn</h2>
          <div className="space-y-3 text-sm text-text-muted leading-relaxed">
            <p>
              <span className="text-yes font-medium">Way 1: Predict correctly.</span>{" "}
              Buy YES or NO. Correct predictions pay $1 per share.
            </p>
            <p>
              <span className="text-caldera font-medium">Way 2: Hold tokens and earn passively.</span>{" "}
              Hold <span className="text-caldera">$CALDRA</span> to earn 0.5% of every trade on Caldera.
              Hold DeSo tokens ($tigerwoods, $lakers, $nba) to earn from predictions about those entities.
            </p>
            <div className="mt-4 rounded-xl bg-background p-4">
              <p className="text-xs font-semibold text-text-muted mb-2">Fee flow per trade</p>
              <p className="text-sm text-text-primary font-mono">
                Trade → 1.0% Platform · 0.5% $CALDRA · 1.5% Entity tokens
              </p>
            </div>
          </div>
        </section>

        {/* Section 6 — Fee table */}
        <section className="relative rounded-2xl border border-border-subtle/30 bg-surface p-6 -mx-6">
          <span className="absolute top-2 right-4 font-display text-[180px] font-black leading-none text-text-primary opacity-[0.03] select-none">06</span>
          <h2 className="section-header mb-4">Fee Structure</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-text-muted">
                  <th className="py-3 text-left font-medium">Recipient</th>
                  <th className="py-3 text-right font-medium">%</th>
                  <th className="py-3 text-left font-medium pl-4">When</th>
                </tr>
              </thead>
              <tbody className="text-text-primary">
                <tr className="border-b border-border-subtle/30">
                  <td className="py-3">Platform</td>
                  <td className="py-3 text-right font-mono">1.0%</td>
                  <td className="py-3 text-left pl-4 text-text-muted text-xs">Every trade</td>
                </tr>
                <tr className="border-b border-border-subtle/30">
                  <td className="py-3 text-caldera">$CALDRA holders</td>
                  <td className="py-3 text-right font-mono text-caldera">0.5%</td>
                  <td className="py-3 text-left pl-4 text-text-muted text-xs">Every trade</td>
                </tr>
                <tr className="border-b border-border-subtle/30">
                  <td className="py-3">Claimed creator</td>
                  <td className="py-3 text-right font-mono">0.75%</td>
                  <td className="py-3 text-left pl-4 text-text-muted text-xs">If creator verified</td>
                </tr>
                <tr className="border-b border-border-subtle/30">
                  <td className="py-3">DeSo token holders</td>
                  <td className="py-3 text-right font-mono text-caldera">0.75-1.5%</td>
                  <td className="py-3 text-left pl-4 text-text-muted text-xs">Split among active tokens</td>
                </tr>
                <tr>
                  <td className="py-3">Community pool</td>
                  <td className="py-3 text-right font-mono">remainder</td>
                  <td className="py-3 text-left pl-4 text-text-muted text-xs">If no DeSo tokens exist</td>
                </tr>
                <tr className="border-t border-border-subtle">
                  <td className="py-3 font-bold">Total</td>
                  <td className="py-3 text-right font-mono font-bold">3.0%</td>
                  <td className="py-3 text-left pl-4 text-text-muted text-xs">Always</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* CTA */}
      <div className="mt-16 text-center">
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
