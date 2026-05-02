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
   * If true, the auto-buy row reads "Goes to {creatorLabel} on every trade"
   * — coins are sent directly to the creator on settle. If false, reads
   * "Buys {creatorLabel} coin (held until they join)" — coins held in
   * platform wallet for an unclaimed creator.
   */
  creatorClaimed?: boolean;
};

export function FeeBreakdown({ fees, creatorLabel, creatorClaimed }: FeeBreakdownProps) {
  const autoBuyLabel = creatorLabel
    ? creatorClaimed
      ? `Goes to ${creatorLabel} on every trade`
      : `Buys ${creatorLabel} coin (held until they join)`
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
