export const metadata = {
  title: "Terms of Service — Caldera",
};

const LAST_UPDATED = "April 13, 2026";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:px-6">
      <h1 className="mb-2 font-display text-4xl font-bold text-text-primary">
        Terms of Service
      </h1>
      <p className="mb-12 text-sm text-text-muted">Last updated: {LAST_UPDATED}</p>

      <div className="space-y-10 text-[15px] leading-relaxed text-text-muted">

        <section>
          <h2 className="mb-3 font-display text-xl font-semibold text-text-primary">
            1. Acceptance of Terms
          </h2>
          <p>
            By accessing or using Caldera ("the Platform"), you agree to be bound by
            these Terms of Service. If you do not agree, do not use the Platform.
            These terms may be updated at any time; continued use constitutes acceptance
            of any changes.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl font-semibold text-text-primary">
            2. Age Requirement
          </h2>
          <p>
            You must be at least <strong className="text-text-primary">18 years of age</strong> to
            use Caldera. By using the Platform you represent and warrant that you are 18 or
            older. We reserve the right to terminate accounts where age cannot be verified.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl font-semibold text-text-primary">
            3. Not Financial Advice
          </h2>
          <p>
            Caldera is <strong className="text-text-primary">not a licensed financial advisor,
            broker, exchange, or investment platform.</strong> Nothing on the Platform
            constitutes financial, legal, or investment advice. Prediction market
            participation is speculative — you can lose the entire value of your
            position. Participate only with funds you can afford to lose entirely.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl font-semibold text-text-primary">
            4. Blockchain Transactions Are Irreversible
          </h2>
          <p>
            All trades and token purchases on Caldera are executed as real transactions
            on the <strong className="text-text-primary">DeSo blockchain</strong>. Blockchain
            transactions are irreversible by nature. Once confirmed on-chain, a transaction
            cannot be reversed, cancelled, or refunded by Caldera or any party. You are
            solely responsible for verifying all transaction details before confirming.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl font-semibold text-text-primary">
            5. Platform Fees
          </h2>
          <p>
            Caldera charges a total fee of <strong className="text-text-primary">2% on every buy trade</strong>. Sell trades are free. The 2% is split evenly: 1% funds platform operations, and 1% is used to buy the market&apos;s creator&apos;s DeSo coin on the open market. Fees are deducted at time of trade and are non-refundable.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl font-semibold text-text-primary">
            6. Creator Coin Auto-Buy
          </h2>
          <p>
            Every prediction market on Caldera is associated with a creator. On every buy trade, 1% of the gross trade amount is used by the platform to purchase the creator&apos;s DeSo coin on the open market. The amount of creator coins received depends on the creator&apos;s bonding curve at the moment of purchase and may vary trade-by-trade.
          </p>
          <p className="mt-3">
            <strong className="text-text-primary">For claimed creators</strong> — i.e. creators who have proven ownership of their profile via the claim flow — the purchased coins are transferred directly from the platform wallet to the creator&apos;s wallet on every trade.
          </p>
          <p className="mt-3">
            <strong className="text-text-primary">For unclaimed creators</strong>, the purchased coins are held in the platform wallet as a claim bounty. When the creator successfully claims their profile, all accumulated coins held in the platform wallet remain available to be transferred or used as the creator directs.
          </p>
          <p className="mt-3">
            Purchased coins are <strong className="text-text-primary">not burned and are not removed from circulation</strong>. DeSo creator coins cannot be burned. No token supply reduction occurs at any time.
          </p>
          <p className="mt-3">
            <strong className="text-text-primary">
              Holding a creator coin does not guarantee any return or monetary value.
            </strong>{" "}
            The buyback mechanic may provide upward price pressure on a coin via bonding-curve dynamics but does not guarantee any price increase. DeSo creator coins represent participation in a creator&apos;s economy on the DeSo blockchain, not securities or investment contracts. Past trading activity does not predict future results.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl font-semibold text-text-primary">
            7. Market Resolution and No Refunds
          </h2>
          <p>
            Once a market is resolved, payouts are final and{" "}
            <strong className="text-text-primary">no refunds will be issued</strong> to
            participants who held the losing side. Resolution is based on publicly
            verifiable information as specified in each market&apos;s resolution criteria.
          </p>
          <p className="mt-3">
            Caldera reserves the right to resolve a market as{" "}
            <strong className="text-text-primary">Cancelled</strong> and return
            funds to all participants if: the underlying event does not occur, the
            resolution criteria cannot be objectively determined, or circumstances
            make fair resolution impossible. In the event of cancellation, positions
            are unwound at their original cost basis as closely as technically feasible.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl font-semibold text-text-primary">
            8. Market Integrity and Suspension
          </h2>
          <p>
            Caldera reserves the right to pause, modify, or cancel any market at any
            time without prior notice if we determine that the market is being manipulated,
            violates applicable law, contains inaccurate information, or otherwise
            threatens the integrity of the Platform.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl font-semibold text-text-primary">
            9. User Conduct
          </h2>
          <p>You agree not to:</p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>Use the Platform for any unlawful purpose</li>
            <li>Manipulate market prices through wash trading or coordinated activity</li>
            <li>Exploit bugs or vulnerabilities rather than reporting them</li>
            <li>Attempt to circumvent any rate limits, security controls, or access restrictions</li>
            <li>Create markets with false, misleading, or defamatory content</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl font-semibold text-text-primary">
            10. Intellectual Property
          </h2>
          <p>
            All content, design, and software on Caldera is the property of Caldera and
            its licensors. You may not reproduce, distribute, or create derivative works
            without explicit written permission.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl font-semibold text-text-primary">
            11. Disclaimer of Warranties
          </h2>
          <p>
            The Platform is provided "as is" and "as available" without warranties of any
            kind, express or implied. Caldera does not warrant that the Platform will be
            uninterrupted, error-free, or free of harmful components.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl font-semibold text-text-primary">
            12. Limitation of Liability
          </h2>
          <p>
            To the maximum extent permitted by law, Caldera shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages arising
            from your use of the Platform, including loss of funds, loss of profits, or
            loss of data.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl font-semibold text-text-primary">
            13. Governing Law
          </h2>
          <p>
            These Terms are governed by and construed in accordance with applicable law.
            Any disputes shall be resolved through binding arbitration on an individual
            basis; class actions are waived to the fullest extent permitted by law.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl font-semibold text-text-primary">
            14. Contact
          </h2>
          <p>
            Questions about these Terms? Contact us at{" "}
            <a
              href="mailto:legal@caldera.market"
              className="text-caldera underline underline-offset-2 hover:opacity-80"
            >
              legal@caldera.market
            </a>
            .
          </p>
        </section>

      </div>
    </div>
  );
}
