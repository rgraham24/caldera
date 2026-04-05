import type { FeeBreakdown as FeeBreakdownType } from "@/lib/fees/calculator";
import { formatCurrency } from "@/lib/utils";

type FeeBreakdownProps = {
  fees: FeeBreakdownType;
};

export function FeeBreakdown({ fees }: FeeBreakdownProps) {
  return (
    <div className="space-y-1 text-xs">
      <div className="flex justify-between">
        <span className="text-text-muted">Platform Fee</span>
        <span className="font-mono text-text-primary">
          {formatCurrency(fees.platformFee)}
        </span>
      </div>
      {fees.creatorFee > 0 && (
        <div className="flex justify-between">
          <span className="text-text-muted">Creator Fee</span>
          <span className="font-mono text-text-primary">
            {formatCurrency(fees.creatorFee)}
          </span>
        </div>
      )}
      {fees.marketCreatorFee > 0 && (
        <div className="flex justify-between">
          <span className="text-text-muted">Market Creator Fee</span>
          <span className="font-mono text-text-primary">
            {formatCurrency(fees.marketCreatorFee)}
          </span>
        </div>
      )}
      <div className="flex justify-between border-t border-border-subtle pt-1 font-medium">
        <span className="text-text-muted">Total Fee</span>
        <span className="font-mono text-text-primary">
          {formatCurrency(fees.totalFee)}
        </span>
      </div>
    </div>
  );
}
