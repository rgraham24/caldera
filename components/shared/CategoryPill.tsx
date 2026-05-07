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

// All 11 production categories get distinct hues, no collisions.
// Avoiding red entirely so category color never confuses with the NO
// button color elsewhere on a card.
//
// Previous bugs this fixes:
//   - Sports and Creators both #f97316 (orange) — visually identical.
//   - Companies #22c55e green collided with the YES bar color.
//   - Commentary and Viral fell through to gray fallback (no entry).
const CATEGORY_COLORS: Record<string, string> = {
  Sports:        "#f97316",  // orange
  Politics:      "#3b82f6",  // blue
  Entertainment: "#a855f7",  // purple
  Companies:     "#14b8a6",  // teal       (was green; conflicted with YES)
  Music:         "#ec4899",  // pink
  Tech:          "#06b6d4",  // cyan
  Climate:       "#84cc16",  // lime
  Creators:      "#d946ef",  // fuchsia    (was orange; collided with Sports)
  Crypto:        "#eab308",  // yellow
  Commentary:    "#6366f1",  // indigo     (new — was falling back to gray)
  Viral:         "#f43f5e",  // rose       (new — was falling back to gray)
};

/**
 * Get the canonical accent color for a category. Exported so other
 * components (e.g. TrendingStrip's hover glow) can match the pill
 * without maintaining a duplicate palette.
 */
export function categoryColor(cat: string | null | undefined): string {
  if (!cat) return "#888888";
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
