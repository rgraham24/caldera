import { cn } from "@/lib/utils";
import type { MarketStatus } from "@/types";

type MarketStatusBadgeProps = {
  status: MarketStatus | string;
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-yes/10 text-yes border-yes/20",
  closed: "bg-text-muted/10 text-text-muted border-text-muted/20",
  resolving: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  resolved: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  cancelled: "bg-no/10 text-no border-no/20",
};

export function MarketStatusBadge({ status }: MarketStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        STATUS_STYLES[status] || STATUS_STYLES.open
      )}
    >
      {status}
    </span>
  );
}
