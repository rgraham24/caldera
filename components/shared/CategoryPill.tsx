import { cn } from "@/lib/utils";

type CategoryPillProps = {
  category: string;
  active?: boolean;
  onClick?: () => void;
};

const DOT_COLORS: Record<string, string> = {
  streamers: "bg-cyan-400",
  music: "bg-pink-400",
  sports: "bg-blue-400",
  politics: "bg-purple-400",
  viral: "bg-amber-400",
  all: "bg-text-muted",
};

export function CategoryPill({ category, active, onClick }: CategoryPillProps) {
  const dotColor = DOT_COLORS[category.toLowerCase()] || "bg-text-muted";

  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors",
        active
          ? "text-caldera border-b-2 border-caldera"
          : "text-text-muted hover:text-text-primary border-b-2 border-transparent",
        onClick && "cursor-pointer"
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-caldera" : dotColor)} />
      {category}
    </button>
  );
}
