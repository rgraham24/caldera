/**
 * Card-shaped skeleton placeholder. Mirrors the silhouette of a
 * MarketCard / generic surface card so the page doesn't jump when
 * real content lands.
 *
 * Backed by the .skeleton class in globals.css (shimmer gradient
 * animation). Layout uses fixed heights for the bars so the
 * placeholder size matches a real card body within a few pixels.
 */

interface Props {
  className?: string;
  /**
   * Approximate height of the card. Defaults to 220px which matches
   * MarketCards rendered height with a 2-line title and the YES/NO
   * buttons below.
   */
  height?: number;
}

export function SkeletonCard({ className, height = 220 }: Props) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface p-4 ${className ?? ""}`}
      style={{ height }}
    >
      {/* Category pill + date placeholder row */}
      <div className="flex items-center justify-between">
        <div className="skeleton h-4 w-14" />
        <div className="skeleton h-3 w-10" />
      </div>
      {/* Title bars */}
      <div className="skeleton h-3 w-full" />
      <div className="skeleton h-3 w-4/5" />
      {/* Progress bar */}
      <div className="skeleton h-1.5 w-full" />
      {/* Big percentage + sparkline row */}
      <div className="mt-auto flex items-end justify-between">
        <div className="skeleton h-7 w-14" />
        <div className="skeleton h-4 w-16" />
      </div>
      {/* YES / NO buttons row */}
      <div className="flex gap-2">
        <div className="skeleton h-8 flex-1" />
        <div className="skeleton h-8 flex-1" />
      </div>
    </div>
  );
}

/**
 * Table-row skeleton — for /leaderboard or /portfolio table loading
 * states. Renders one tr with N cells of varying widths.
 */
export function SkeletonRow({ cells = 5 }: { cells?: number }) {
  return (
    <tr className="border-b border-border-subtle/20">
      {Array.from({ length: cells }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className={`skeleton h-4 ${i === 0 ? "w-6" : i === 1 ? "w-32" : "w-16"}`} />
        </td>
      ))}
    </tr>
  );
}
