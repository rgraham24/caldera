import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ADMIN_PW = process.env.ADMIN_PASSWORD ?? "caldera-admin-2026";
const CONFIDENCE_AUTO = 85;
const CONFIDENCE_REVIEW = 60;

type ClaudeResolution = {
  outcome: "yes" | "no" | "unknown";
  confidence: number;
  reasoning: string;
  source_hint: string;
};

type MarketRow = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  resolve_at: string | null;
  resolution_note: string | null;
  total_volume: number | null;
};

/**
 * Category-specific pre-screening before calling Claude.
 * Returns null to proceed normally, or a forced result.
 */
function prescreenMarket(market: MarketRow): { skip: true; reason: string } | null {
  const title = market.title.toLowerCase();

  // Stock/price markets need live data — always skip
  if (
    market.category === "Companies" &&
    /above|below|reach|\$\d|\bprice\b/.test(title)
  ) {
    return { skip: true, reason: "Requires live price data — check finance.yahoo.com" };
  }

  // YouTube/subscriber counts change daily — skip
  if (/subscriber|followers|million sub/.test(title)) {
    return { skip: true, reason: "Requires live subscriber count — check YouTube/social directly" };
  }

  return null;
}

async function resolveWithClaude(
  market: MarketRow,
  apiKey: string
): Promise<ClaudeResolution> {
  const prompt = `You are a prediction market resolution oracle.
Your job is to determine if a prediction market should resolve YES or NO based on real-world facts.

Market question: "${market.title}"
Resolution criteria: "${market.description || "(none provided)"}"
Market resolve date: "${market.resolve_at}"
Category: "${market.category}"

Based on your knowledge up to your training cutoff, has this event occurred or is the outcome determinable?

Rules:
- Sports events with clear historical outcomes (past games, championships): you can be confident
- Political events (elections, appointments): be confident only if outcome is widely known
- Stock price targets: set confidence 0 — you cannot know current prices
- Subscriber/follower counts: set confidence 0 — these change daily
- Future events you cannot know: set outcome "unknown"

Respond with ONLY valid JSON, no markdown, no explanation outside the JSON:
{
  "outcome": "yes" | "no" | "unknown",
  "confidence": 0-100,
  "reasoning": "1-2 sentence explanation of your determination",
  "source_hint": "what to check to verify (URL or description)"
}

If confidence < 80, set outcome to "unknown". Only resolve YES or NO if highly confident.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status}`);
  }

  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  const text = data.content?.[0]?.type === "text" ? data.content[0].text : "";

  // Strip markdown code fences if present
  const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned) as ClaudeResolution;
}

async function settlePositions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  marketId: string,
  outcome: "yes" | "no",
  now: string
): Promise<{ positionsSettled: number; winnersCount: number; totalPaidOut: number }> {
  const { data: positions } = await supabase
    .from("positions")
    .select("id, side, quantity, total_cost")
    .eq("market_id", marketId)
    .eq("status", "open");

  let winnersCount = 0;
  let totalPaidOut = 0;

  for (const pos of positions ?? []) {
    const isWinner = pos.side === outcome;
    const realizedPnl = isWinner
      ? (pos.quantity ?? 0) * 1.0 - (pos.total_cost ?? 0)
      : -(pos.total_cost ?? 0);

    await supabase
      .from("positions")
      .update({ status: "settled", realized_pnl: realizedPnl })
      .eq("id", pos.id);

    if (isWinner) {
      winnersCount++;
      totalPaidOut += (pos.quantity ?? 0) * 1.0;
    }
  }

  try {
    await supabase.from("market_resolutions").insert({
      market_id: marketId,
      outcome,
      notes: `AI_AUTO_RESOLVED`,
      created_at: now,
    });
  } catch { /* non-critical */ }

  return {
    positionsSettled: positions?.length ?? 0,
    winnersCount,
    totalPaidOut: Math.round(totalPaidOut * 100) / 100,
  };
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { adminPassword, marketId } = body as {
    adminPassword?: string;
    marketId?: string;
  };

  if (adminPassword !== ADMIN_PW) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  // Fetch markets to process
  let query = supabase
    .from("markets")
    .select(
      "id, title, description, category, resolve_at, resolution_note, total_volume"
    )
    .eq("status", "open")
    .lt("resolve_at", now)
    .neq("category", "Crypto")
    .is("resolution_outcome", null);

  if (marketId) {
    query = query.eq("id", marketId);
  } else {
    query = query.limit(10);
  }

  const { data: markets } = await query;

  if (!markets || markets.length === 0) {
    return NextResponse.json({
      processed: 0,
      autoResolved: [],
      flaggedForReview: [],
      skipped: [],
    });
  }

  // apiKey used via closure in resolveWithClaude

  const autoResolved: Array<{
    marketId: string;
    title: string;
    outcome: string;
    confidence: number;
    reasoning: string;
  }> = [];

  const flaggedForReview: Array<{
    marketId: string;
    title: string;
    reasoning: string;
  }> = [];

  const skipped: Array<{ marketId: string; title: string; reason: string }> = [];

  for (const market of markets as MarketRow[]) {
    // Pre-screening
    const prescreened = prescreenMarket(market);
    if (prescreened?.skip) {
      skipped.push({ marketId: market.id, title: market.title, reason: prescreened.reason });
      continue;
    }

    let resolution: ClaudeResolution;
    try {
      resolution = await resolveWithClaude(market, apiKey);
    } catch (err) {
      skipped.push({
        marketId: market.id,
        title: market.title,
        reason: `Claude error: ${err instanceof Error ? err.message : "unknown"}`,
      });
      continue;
    }

    if (resolution.confidence >= CONFIDENCE_AUTO && resolution.outcome !== "unknown") {
      // Auto-resolve
      await supabase
        .from("markets")
        .update({
          status: "resolved",
          resolution_outcome: resolution.outcome,
          resolved_at: now,
          resolution_note: `AI_AUTO_RESOLVED [${resolution.confidence}% confidence]: ${resolution.reasoning}`,
          resolution_source_url: resolution.source_hint || null,
        })
        .eq("id", market.id);

      await settlePositions(supabase, market.id, resolution.outcome, now);

      autoResolved.push({
        marketId: market.id,
        title: market.title,
        outcome: resolution.outcome,
        confidence: resolution.confidence,
        reasoning: resolution.reasoning,
      });
    } else if (resolution.confidence >= CONFIDENCE_REVIEW) {
      // Flag for review — store Claude's analysis but don't resolve
      await supabase
        .from("markets")
        .update({
          resolution_note: `AI_FLAGGED [${resolution.confidence}% confidence, suggested: ${resolution.outcome}]: ${resolution.reasoning} | Source hint: ${resolution.source_hint}`,
        })
        .eq("id", market.id);

      flaggedForReview.push({
        marketId: market.id,
        title: market.title,
        reasoning: resolution.reasoning,
      });
    } else {
      skipped.push({
        marketId: market.id,
        title: market.title,
        reason: `Low confidence (${resolution.confidence}%): ${resolution.reasoning}`,
      });
    }
  }

  return NextResponse.json({
    processed: markets.length,
    autoResolved,
    flaggedForReview,
    skipped,
  });
}
