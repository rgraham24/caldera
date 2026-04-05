import { cn, formatPercent } from "@/lib/utils";

type ProbabilityBadgeProps = {
  probability: number;
  size?: "sm" | "md" | "lg" | "xl";
};

export function ProbabilityBadge({
  probability,
  size = "md",
}: ProbabilityBadgeProps) {
  const isYesFavored = probability >= 0.5;

  return (
    <span
      className={cn(
        "inline-flex items-center font-mono font-bold",
        isYesFavored ? "text-yes" : "text-no",
        size === "sm" && "text-sm",
        size === "md" && "text-lg",
        size === "lg" && "text-2xl",
        size === "xl" && "text-6xl font-display tracking-tight"
      )}
    >
      {formatPercent(probability)}
      {size !== "xl" && (
        <span className="ml-1 text-xs font-normal text-text-muted">
          {isYesFavored ? "YES" : "NO"}
        </span>
      )}
    </span>
  );
}
