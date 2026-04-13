"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Market } from "@/types";
import { formatCompactCurrency, formatRelativeTime, cn } from "@/lib/utils";

type DurationTab = "all" | "5min" | "1hr" | "daily";

function classifyMarket(m: Market): DurationTab {
  if (!m.resolve_at) return "all";
  const minsLeft = (new Date(m.resolve_at).getTime() - Date.now()) / 60_000;
  if (minsLeft <= 10)  return "5min";
  if (minsLeft <= 180) return "1hr";
  return "daily";
}

const DURATION_TABS: { value: DurationTab; label: string; desc: string }[] = [
  { value: "all",   label: "All",    desc: "All open markets" },
  { value: "5min",  label: "5 Min",  desc: "Resolves within 20 minutes" },
  { value: "1hr",   label: "1 Hour", desc: "Resolves within 3 hours" },
  { value: "daily", label: "Daily",  desc: "Resolves end of day" },
];

export default function CryptoPage() {
  const router = useRouter();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DurationTab>("all");
  const [now, setNow] = useState(Date.now());

  // Tick every 10s so countdown labels stay fresh and tab filtering re-evaluates
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch("/api/markets?category=Crypto&status=open&limit=100&sort=resolving_soon")
      .then((r) => r.json())
      .then(({ data }) => setMarkets(Array.isArray(data) ? data : []))
      .catch(() => setMarkets([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (tab === "all") return markets;
    return markets.filter((m) => classifyMarket(m) === tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets, tab, now]);

  const counts = useMemo(() => {
    const c: Record<DurationTab, number> = { all: markets.length, "5min": 0, "1hr": 0, daily: 0 };
    for (const m of markets) {
      const d = classifyMarket(m);
      if (d !== "all") c[d]++;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets, now]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-text-primary">₿ Crypto</h1>
        <p className="mt-1 text-sm text-text-muted">
          Real-time price prediction markets across multiple time horizons
        </p>
      </div>

      {/* Duration tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {DURATION_TABS.map((t) => (
          <button
            key={t.value}
            title={t.desc}
            onClick={() => setTab(t.value)}
            className={cn(
              "shrink-0 rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
              tab === t.value
                ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
                : "border-border-subtle bg-surface text-text-muted hover:text-text-primary hover:border-border-default"
            )}
          >
            {t.label}
            {counts[t.value] > 0 && (
              <span className={cn(
                "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                tab === t.value ? "bg-orange-500/20 text-orange-400" : "bg-border-subtle text-text-faint"
              )}>
                {counts[t.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl border border-border-subtle bg-surface" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-sm text-text-muted">
            {tab === "all"
              ? "No crypto markets open right now. Check back shortly."
              : `No ${tab === "5min" ? "5-minute" : tab === "1hr" ? "1-hour" : "daily"} markets open right now.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((market) => (
            <CryptoMarketCard
              key={market.id}
              market={market}
              onTrade={(slug, side) => router.push(`/markets/${slug}?side=${side}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Crypto market card ────────────────────────────────────────────────────────

function CryptoMarketCard({
  market,
  onTrade,
}: {
  market: Market;
  onTrade: (slug: string, side: "yes" | "no") => void;
}) {
  const yes = Math.round((market.yes_price ?? 0.5) * 100);
  const no = 100 - yes;
  const vol = market.total_volume ?? 0;
  const duration = classifyMarket(market);
  const minsLeft = market.resolve_at
    ? Math.max(0, Math.ceil((new Date(market.resolve_at).getTime() - Date.now()) / 60_000))
    : null;

  const durationBadge =
    duration === "5min"  ? { label: "5 MIN",   color: "text-red-400 bg-red-500/10 border-red-500/20" } :
    duration === "1hr"   ? { label: "1 HOUR",  color: "text-amber-400 bg-amber-500/10 border-amber-500/20" } :
    duration === "daily" ? { label: "DAILY",   color: "text-blue-400 bg-blue-500/10 border-blue-500/20" } :
    null;

  return (
    <div className="group flex flex-col rounded-xl border border-border-subtle bg-surface p-4 transition-all duration-150 hover:border-caldera/30 hover:-translate-y-px hover:shadow-lg hover:shadow-black/20">
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        {durationBadge && (
          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider", durationBadge.color)}>
            {durationBadge.label}
          </span>
        )}
        {minsLeft !== null && (
          <span className={cn(
            "ml-auto text-[10px] font-medium tabular-nums",
            minsLeft <= 5 ? "text-red-400 animate-pulse" : minsLeft <= 60 ? "text-amber-400" : "text-text-faint"
          )}>
            {minsLeft < 60
              ? `${minsLeft}m left`
              : minsLeft < 1440
              ? `${Math.ceil(minsLeft / 60)}h left`
              : formatRelativeTime(market.resolve_at!)}
          </span>
        )}
      </div>

      {/* Title */}
      <Link href={`/markets/${market.slug}`} className="mb-auto">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-text-primary group-hover:text-white">
          {market.title}
        </p>
      </Link>

      {/* Creator tag */}
      {market.creator_slug && (
        <p className="mt-1 text-xs text-caldera">${market.creator_slug}</p>
      )}

      {/* Probability bar */}
      <div className="mt-3 mb-3">
        <div className="mb-1 flex items-center justify-between">
          <span
            className="font-mono text-base font-bold tabular-nums"
            style={{ color: yes >= 50 ? "var(--yes)" : "var(--no)" }}
          >
            {yes}%
          </span>
          <span className="font-mono text-xs text-text-faint">{no}% NO</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-border-subtle">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${yes}%`, background: yes >= 50 ? "var(--yes)" : "var(--no)" }}
          />
        </div>
      </div>

      {/* Vol + buttons */}
      <div className="flex items-center gap-2">
        {vol > 0 && (
          <span className="mr-auto font-mono text-xs text-text-faint">{formatCompactCurrency(vol)} vol</span>
        )}
        <button
          onClick={() => onTrade(market.slug, "yes")}
          className="rounded-lg bg-yes/10 px-3 py-1 text-xs font-semibold text-yes transition-colors hover:bg-yes hover:text-white"
        >
          YES
        </button>
        <button
          onClick={() => onTrade(market.slug, "no")}
          className="rounded-lg bg-no/10 px-3 py-1 text-xs font-semibold text-no transition-colors hover:bg-no hover:text-white"
        >
          NO
        </button>
      </div>
    </div>
  );
}
