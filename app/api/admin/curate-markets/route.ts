import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_KEYS } from "@/lib/admin/market-generator";

export const maxDuration = 60;

const CURATOR_SYSTEM_PROMPT =
  "You are a prediction market curator. Given a list of markets with their trading data, return a JSON array of market IDs sorted by engagement priority for homepage featuring. Consider: recency of trades, volume, resolve date urgency (sooner = higher priority), and title appeal. Return ONLY a JSON array of market IDs exactly as I provided them, no modifications, nothing else.";

const FEATURED_COUNT = 8;

async function runCuration() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const supabase = await createClient();

  const { data: markets, error: marketsError } = await supabase
    .from("markets")
    .select("id, title, total_volume, resolve_at")
    .eq("status", "open")
    .order("total_volume", { ascending: false })
    .limit(50);

  if (marketsError || !markets?.length) {
    throw new Error("Failed to fetch markets");
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const marketIds = markets.map((m) => m.id);

  const { data: recentTrades } = await supabase
    .from("trades")
    .select("market_id, user_id")
    .in("market_id", marketIds)
    .gte("created_at", since24h);

  const tradeCount24h: Record<string, number> = {};
  const uniqueTraders24h: Record<string, Set<string>> = {};

  for (const trade of recentTrades ?? []) {
    tradeCount24h[trade.market_id] = (tradeCount24h[trade.market_id] ?? 0) + 1;
    if (!uniqueTraders24h[trade.market_id]) uniqueTraders24h[trade.market_id] = new Set();
    uniqueTraders24h[trade.market_id].add(trade.user_id);
  }

  const marketData = markets.map((m) => ({
    id: m.id,
    title: m.title,
    total_volume: m.total_volume,
    trade_count_24h: tradeCount24h[m.id] ?? 0,
    unique_traders_24h: uniqueTraders24h[m.id]?.size ?? 0,
    resolve_at: m.resolve_at,
  }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: CURATOR_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Here are the markets: ${JSON.stringify(marketData)}` }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API error (${res.status}): ${await res.text()}`);
  }

  const claudeData = await res.json();
  const rawText: string = claudeData.content?.[0]?.text ?? "";

  console.log("[curate-markets] Claude raw response:", JSON.stringify(rawText));

  // Strip markdown code fences, then try direct parse, then regex fallback
  const text = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let rankedIds: string[];
  try {
    rankedIds = JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/)?.[0];
    if (!match) {
      console.error("[curate-markets] Failed to parse Claude response. Raw:", rawText.slice(0, 500));
      return { featured: 0, total_evaluated: markets.length };
    }
    rankedIds = JSON.parse(match);
  }

  const topMarketIds = rankedIds.slice(0, FEATURED_COUNT);
  console.log("[curate-markets] topMarketIds to feature:", topMarketIds);

  await supabase.from("markets").update({ is_hero: false }).neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("markets").update({ is_hero: true }).in("id", topMarketIds);

  return { featured: topMarketIds.length, total_evaluated: markets.length };
}

// GET — called by Vercel cron
export async function GET(req: NextRequest) {
  if (!req.headers.get("x-vercel-cron")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const data = await runCuration();
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[curate-markets] cron error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Curation failed" }, { status: 500 });
  }
}

// POST — manual trigger from admin panel
export async function POST(req: NextRequest) {
  try {
    const { desoPublicKey, adminPassword } = await req.json();

    const isAdmin =
      ADMIN_KEYS.includes(desoPublicKey || "") ||
      (process.env.ADMIN_PASSWORD && adminPassword === process.env.ADMIN_PASSWORD);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = await runCuration();
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
