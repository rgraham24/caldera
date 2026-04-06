import { cn } from "@/lib/utils";

type CategoryPillProps = {
  category: string;
  active?: boolean;
  onClick?: () => void;
};

const DOT_COLORS: Record<string, string> = {
  creators: "bg-cyan-400",
  streamers: "bg-cyan-400",
  music: "bg-pink-400",
  sports: "bg-blue-400",
  politics: "bg-purple-400",
  entertainment: "bg-amber-400",
  viral: "bg-amber-400",
  tech: "bg-emerald-400",
  all: "bg-text-muted",
};

// Map DB values to clean display labels
const DISPLAY_LABELS: Record<string, string> = {
  creators: "Creators",
  streamers: "Creators",
  music: "Music",
  sports: "Sports",
  politics: "Politics",
  entertainment: "Entertainment",
  viral: "Entertainment",
  tech: "Tech",
};

export function CategoryPill({ category, active, onClick }: CategoryPillProps) {
  const dotColor = DOT_COLORS[category.toLowerCase()] || "bg-text-muted";
  const label = DISPLAY_LABELS[category.toLowerCase()] || category;

  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 cursor-pointer px-3 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors",
        active
          ? "text-caldera border-b-2 border-caldera"
          : "text-text-muted hover:text-text-primary border-b-2 border-transparent"
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-caldera" : dotColor)} />
      {label}
    </button>
  );
}
