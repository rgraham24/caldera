import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type TierBadgeProps = {
  tier: string;
  size?: "sm" | "md";
};

export function TierBadge({ tier, size = "sm" }: TierBadgeProps) {
  const config = {
    verified_creator: {
      label: "Verified",
      dot: "bg-caldera",
      text: "text-caldera",
      tooltip: "Verified Creator — earns from every trade",
    },
    public_figure: {
      label: "Public Figure",
      dot: "bg-text-muted",
      text: "text-text-muted",
      tooltip: "Public Figure — earnings go to coin holders",
    },
    unclaimed: {
      label: "Unclaimed",
      dot: "bg-amber-400",
      text: "text-amber-400",
      tooltip: "Unclaimed — claim to start earning",
    },
  }[tier] || { label: tier, dot: "bg-text-muted", text: "text-text-muted", tooltip: "" };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          className={cn(
            "inline-flex items-center gap-1",
            size === "sm" ? "text-[10px]" : "text-xs",
            config.text
          )}
        >
          <span className={cn("rounded-full", config.dot, size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2")} />
          {config.label}
        </TooltipTrigger>
        <TooltipContent className="bg-surface border-border-subtle text-text-primary">
          <p className="text-xs">{config.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
