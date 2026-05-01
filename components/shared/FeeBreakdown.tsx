import { formatCurrency } from "@/lib/utils";

export type FeeBreakdownProps = {
  fees: {
    platform: number;
    creatorAutoBuy: number;
    total: number;
  };
  /** Shown next to the auto-buy line. e.g. "$ALICE" or "Alice's coin". */
  creatorLabel?: string;
  /**
   * If true, the auto-buy row reads "Buys {creatorLabel}" — coins are
   * sent directly to the creator on settle. If false, reads
   * "Builds claim bounty for {creatorLabel}" — coins held in platform
   * wallet for an unclaimed creator.
   */
  creatorClaimed?: boolean;
};

export function FeeBreakdown({ fees, creatorLabel, creatorClaimed }: FeeBreakdownProps) {
  const autoBuyLabel = creatorLabel
    ? creatorClaimed
      ? `Buys ${creatorLabel}`
      : `Builds claim bounty for ${creatorLabel}`
    : "Creator coin auto-buy";

  return (
    <div className="space-y-1 text-xs">
      <div className="flex justify-between">
        <span className="text-text-muted">Platform fee</span>
        <span className="font-mono text-text-primary">
          {formatCurrency(fees.platform)}
        </span>
      </div>
      {fees.creatorAutoBuy > 0 && (
        <div className="flex justify-between">
          <span className="text-text-muted">{autoBuyLabel}</span>
          <span className="font-mono text-text-primary">
            {formatCurrency(fees.creatorAutoBuy)}
          </span>
        </div>
      )}
      <div className="flex justify-between border-t border-border-subtle pt-1 font-medium">
        <span className="text-text-muted">Total fee (2%)</span>
        <span className="font-mono text-text-primary">
          {formatCurrency(fees.total)}
        </span>
      </div>
    </div>
  );
}
