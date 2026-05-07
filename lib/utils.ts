import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = "$" + abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return amount < 0 ? "-" + formatted : formatted;
}

export function formatCompactCurrency(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(1)}k`;
  }
  return formatCurrency(amount);
}

export function formatPercent(decimal: number): string {
  return `${(decimal * 100).toFixed(0)}%`;
}

export function formatPercentDecimal(decimal: number): string {
  return `${(decimal * 100).toFixed(1)}%`;
}

/**
 * Single source of truth for "time until market resolves" display on
 * market cards (hero, trending strip, all-markets grid). Rules:
 *   - Null / undefined input          → ""
 *   - Already past resolve_at         → "ended"
 *   - Resolves in < 1 hour            → "<1h left"
 *   - Resolves in < 1 day             → "Nh left"
 *   - Resolves in < 60 days           → "N day(s) left"
 *   - Resolves in 60+ days            → "Resolves Mon YYYY" (e.g. "Resolves Aug 2026")
 *
 * The 60-day relative→absolute threshold matches the curated-catalog
 * resolve-date distribution. Use this helper instead of formatRelativeTime
 * for any market resolve_at — formatRelativeTime is for general-purpose
 * past/future relative phrasing (chat timestamps, activity feeds).
 */
export function formatMarketTimeLeft(resolveAt: string | Date | null | undefined): string {
  if (!resolveAt) return "";
  const target = typeof resolveAt === "string" ? new Date(resolveAt) : resolveAt;
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return "ended";
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) {
    const hours = Math.floor(ms / 3_600_000);
    return hours <= 1 ? "<1h left" : `${hours}h left`;
  }
  if (days < 60) return `${days} day${days === 1 ? "" : "s"} left`;
  const month = target.toLocaleString("en-US", { month: "short" });
  const year = target.getFullYear();
  return `Resolves ${month} ${year}`;
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const d = new Date(date);
  const diff = d.getTime() - now.getTime();
  const absDiff = Math.abs(diff);
  const days = Math.floor(absDiff / 86400000);

  if (diff > 0) {
    if (days > 90) {
      return `Resolves ${d.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
    }
    if (days > 0) return `${days} days left`;
    const hours = Math.floor(absDiff / 3600000);
    if (hours > 0) return `${hours}h left`;
    return `${Math.floor(absDiff / 60000)}m left`;
  } else {
    if (days > 90) {
      return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    }
    if (days > 0) return `${days} days ago`;
    const hours = Math.floor(absDiff / 3600000);
    if (hours > 0) return `${hours}h ago`;
    return `${Math.floor(absDiff / 60000)}m ago`;
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
