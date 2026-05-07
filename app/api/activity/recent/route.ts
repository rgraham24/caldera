import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/activity/recent
 *
 * Returns the last 24h of real platform events (trades, resolutions, new
 * markets) for the homepage live ticker. If the platform is too quiet to
 * fill the strip (<5 events), pads with rotating "platform truth" lines.
 *
 * Cache: 30s on Vercel edge (matches the client's 30s refetch cadence).
 */

export const revalidate = 30;

export type ActivityEvent = {
  id: string;
  type: "trade" | "resolution" | "new_market" | "milestone" | "truth";
  text: string;
  emoji: string;
  /** Unix ms timestamp; truths use Date.now() so they sort to the end. */
  ts: number;
};

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  const supabase = await createClient();
  const since = new Date(Date.now() - TWENTY_FOUR_HOURS_MS).toISOString();

  const events: ActivityEvent[] = [];

  // 1. Recent trades (top 15 in last 24h, joined to markets for slug + title).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: trades } = await (supabase as any)
    .from("trades")
    .select("id, side, gross_amount, created_at, markets(slug, title, creator_slug, category)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(15);

  for (const t of (trades ?? []) as Array<{
    id: string;
    side: string;
    gross_amount: number | string | null;
    created_at: string;
    markets: { slug: string; title: string; creator_slug: string | null; category: string | null } | null;
  }>) {
    const m = t.markets;
    if (!m) continue;
    const amount = Number(t.gross_amount ?? 0);
    const sideLabel = t.side === "yes" ? "YES" : "NO";
    events.push({
      id: `trade:${t.id}`,
      type: "trade",
      emoji: "🟢",
      text: `$${amount.toFixed(2)} on ${sideLabel} · ${truncate(m.title, 60)}`,
      ts: new Date(t.created_at).getTime(),
    });
  }

  // 2. Recent resolutions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: resolutions } = await (supabase as any)
    .from("market_resolutions")
    .select("id, outcome, created_at, markets(title)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10);

  for (const r of (resolutions ?? []) as Array<{
    id: string;
    outcome: string;
    created_at: string;
    markets: { title: string } | null;
  }>) {
    if (!r.markets) continue;
    events.push({
      id: `resolution:${r.id}`,
      type: "resolution",
      emoji: "⚪",
      text: `${truncate(r.markets.title, 55)} resolved ${r.outcome.toUpperCase()}`,
      ts: new Date(r.created_at).getTime(),
    });
  }

  // 3. New markets (created in the last 24h)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: newMarkets } = await (supabase as any)
    .from("markets")
    .select("id, title, created_at, status")
    .gte("created_at", since)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(10);

  for (const m of (newMarkets ?? []) as Array<{
    id: string;
    title: string;
    created_at: string;
  }>) {
    events.push({
      id: `new:${m.id}`,
      type: "new_market",
      emoji: "✨",
      text: `New market: ${truncate(m.title, 65)}`,
      ts: new Date(m.created_at).getTime(),
    });
  }

  // 4. Volume milestones — markets that crossed $100/$500/$1000 in the last
  // 24h. Without a snapshot table for volume we approximate by checking
  // current total_volume against the thresholds and the market's
  // updated_at; emit only if updated within 24h.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: hotMarkets } = await (supabase as any)
    .from("markets")
    .select("id, title, total_volume, updated_at")
    .gte("updated_at", since)
    .gte("total_volume", 100)
    .order("updated_at", { ascending: false })
    .limit(8);

  for (const m of (hotMarkets ?? []) as Array<{
    id: string;
    title: string;
    total_volume: number | string | null;
    updated_at: string;
  }>) {
    const vol = Number(m.total_volume ?? 0);
    const tier = vol >= 1000 ? 1000 : vol >= 500 ? 500 : 100;
    events.push({
      id: `milestone:${m.id}:${tier}`,
      type: "milestone",
      emoji: "🎯",
      text: `${truncate(m.title, 55)} hit $${tier} vol`,
      ts: new Date(m.updated_at).getTime(),
    });
  }

  // Sort all real events by timestamp DESC and slice top 20.
  events.sort((a, b) => b.ts - a.ts);
  let result = events.slice(0, 20);

  // Pad with platform truths if too quiet.
  if (result.length < 5) {
    const truths = await buildTruths(supabase);
    result = [...result, ...truths].slice(0, 20);
  }

  if (result.length === 0) {
    result = [
      {
        id: "truth:prelaunch",
        type: "truth",
        emoji: "💎",
        text: "Pre-launch — first trades coming soon",
        ts: Date.now(),
      },
    ];
  }

  return NextResponse.json({ data: result });
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildTruths(supabase: any): Promise<ActivityEvent[]> {
  const out: ActivityEvent[] = [
    {
      id: "truth:1pct",
      type: "truth",
      emoji: "💎",
      text: "1% of every trade goes to creator coins",
      ts: Date.now(),
    },
  ];

  const { data: topCreator } = await supabase
    .from("creators")
    .select("name")
    .order("creator_coin_price", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (topCreator?.name) {
    out.push({
      id: "truth:topcreator",
      type: "truth",
      emoji: "🔥",
      text: `${topCreator.name} trending today`,
      ts: Date.now() - 1,
    });
  }

  const { count: resolvingCount } = await supabase
    .from("markets")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .gte("resolve_at", new Date().toISOString())
    .lte("resolve_at", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());

  if (resolvingCount && resolvingCount > 0) {
    out.push({
      id: "truth:resolvingsoon",
      type: "truth",
      emoji: "⚡",
      text: `${resolvingCount} markets resolving this week`,
      ts: Date.now() - 2,
    });
  }

  return out;
}
