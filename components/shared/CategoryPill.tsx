/**
 * Category badge — single source of truth for the colored uppercase pill
 * that labels a market's category. Used by hero cards, the trending strip,
 * and the all-markets card grid so the styling is identical everywhere.
 *
 * Color palette matches the previous TrendingStrip-only colors so existing
 * trending-strip cards render unchanged after refactor.
 *
 * The previous CategoryPill component was a clickable filter button. That
 * pattern lives in app/(main)/markets/page.tsx via a different filter UI;
 * the only label-style consumer (market-detail-client.tsx) is updated to
 * use this badge instead.
 */

const CATEGORY_COLORS: Record<string, string> = {
  Sports: "#f97316",
  Politics: "#3b82f6",
  Entertainment: "#a855f7",
  Crypto: "#eab308",
  Companies: "#22c55e",
  Music: "#ec4899",
  Tech: "#06b6d4",
  Climate: "#84cc16",
  Creators: "#f97316",
};

function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? "#888888";
}

type CategoryPillProps = {
  category: string | null | undefined;
  size?: "sm" | "md";
};

export function CategoryPill({ category, size = "sm" }: CategoryPillProps) {
  if (!category) return null;
  const color = categoryColor(category);
  const sizeClasses =
    size === "md"
      ? "px-2 py-0.5 text-[10px]"
      : "px-1.5 py-0.5 text-[9px]";
  return (
    <span
      className={`inline-block shrink-0 rounded-full font-bold uppercase tracking-widest ${sizeClasses}`}
      style={{ background: `${color}20`, color }}
    >
      {category}
    </span>
  );
}
