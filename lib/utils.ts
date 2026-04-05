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
