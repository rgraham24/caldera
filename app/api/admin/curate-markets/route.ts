import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_KEYS } from "@/lib/admin/market-generator";

const CURATOR_SYSTEM_PROMPT =
  "You are a prediction market curator. Given a list of markets with their trading data, return a JSON array of market IDs sorted by engagement priority for homepage featuring. Consider: recency of trades, volume, resolve date urgency (sooner = higher priority), and title appeal. Return ONLY a JSON array of market IDs in priority order, nothing else.";

const FEATURED_COUNT = 8;

export async function POST(req: NextRequest) {
  try {
    const { desoPublicKey, adminPassword } = await req.json();

    const isAdmin =
      ADMIN_KEYS.includes(desoPublicKey || "") ||
      (process.env.ADMIN_PASSWORD && adminPassword === process.env.ADMIN_PASSWORD);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    const supabase = await createClient();

    // Fetch top 50 open markets by volume
    const { data: markets, error: marketsError } = await supabase
      .from("markets")
      .select("id, title, total_volume, resolve_at")
      .eq("status", "open")
      .order("total_volume", { ascending: false })
      .limit(50);

    if (marketsError || !markets?.length) {
      return NextResponse.json({ error: "Failed to fetch markets" }, { status: 500 });
    }

    // Fetch 24h trade activity for these markets
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const marketIds = markets.map((m) => m.id);

    const { data: recentTrades } = await supabase
      .from("trades")
      .select("market_id, user_id")
      .in("market_id", marketIds)
      .gte("created_at", since24h);

    // Aggregate 24h stats per market
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

    // Ask Claude to rank by engagement priority
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
        messages: [
          {
            role: "user",
            content: `Here are the markets: ${JSON.stringify(marketData)}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Claude API error (${res.status}): ${err}` }, { status: 500 });
    }

    const claudeData = await res.json();
    const text: string = claudeData.content?.[0]?.text ?? "";

    let rankedIds: string[];
    try {
      rankedIds = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) {
        return NextResponse.json({ error: "Failed to parse Claude response", raw: text }, { status: 500 });
      }
      rankedIds = JSON.parse(match[0]);
    }

    const heroIds = new Set(rankedIds.slice(0, FEATURED_COUNT));

    // Clear all is_hero flags first, then set the chosen ones
    await supabase.from("markets").update({ is_hero: false }).eq("status", "open");
    await supabase.from("markets").update({ is_hero: true }).in("id", [...heroIds]);

    return NextResponse.json({
      data: { featured: heroIds.size, total_evaluated: markets.length },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
