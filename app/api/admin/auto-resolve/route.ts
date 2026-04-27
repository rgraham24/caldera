import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  resolveSportsMarket,
  detectSport,
} from "@/lib/resolution/sports-resolver";
import { resolveMarket } from "@/lib/markets/resolution";
import { isAdminAuthorized } from "@/lib/admin/auth";

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
 * Returns null to proceed normally, or a forced skip.
 */
function prescreenMarket(
  market: MarketRow
): { skip: true; reason: string } | null {
  const title = market.title.toLowerCase();

  // Stock/price markets need live data — always skip
  if (
    market.category === "Companies" &&
    /above|below|reach|\$\d|\bprice\b/.test(title)
  ) {
    return {
      skip: true,
      reason: "Requires live price data — check finance.yahoo.com",
    };
  }

  // YouTube/subscriber counts change daily — skip
  if (/subscriber|followers|million sub/.test(title)) {
    return {
      skip: true,
      reason: "Requires live subscriber count — check YouTube/social directly",
    };
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

  const data = (await res.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  const text = data.content?.[0]?.type === "text" ? data.content[0].text : "";

  // Strip markdown code fences if present
  const cleaned = text
    .replace(/```(?:json)?\s*/g, "")
    .replace(/```/g, "")
    .trim();
  return JSON.parse(cleaned) as ClaudeResolution;
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

  if (!isAdminAuthorized(adminPassword, undefined)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set" },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  // Fetch markets to process
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
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

  const autoResolved: Array<{
    marketId: string;
    title: string;
    outcome: string;
    confidence: number;
    reasoning: string;
    method: "ESPN" | "AI";
  }> = [];

  const flaggedForReview: Array<{
    marketId: string;
    title: string;
    reasoning: string;
  }> = [];

  const skipped: Array<{ marketId: string; title: string; reason: string }> =
    [];

  for (const market of markets as MarketRow[]) {
    // Pre-screening
    const prescreened = prescreenMarket(market);
    if (prescreened?.skip) {
      skipped.push({
        marketId: market.id,
        title: market.title,
        reason: prescreened.reason,
      });
      continue;
    }

    // ── Step 1: Try ESPN for Sports markets ──
    if (market.category === "Sports" && detectSport(market.title)) {
      let espnResult;
      try {
        espnResult = await resolveSportsMarket(market);
      } catch (err) {
        console.error("[auto-resolve] ESPN error for", market.title, err);
        // Fall through to Claude
      }

      if (espnResult?.resolved && espnResult.outcome !== "unknown") {
        const espnNote = `ESPN_AUTO_RESOLVED [${espnResult.confidence}% confidence]: ${espnResult.reasoning}`;
        const result = await resolveMarket(supabase, {
          marketId: market.id,
          outcome: espnResult.outcome,
          resolutionNote: espnNote,
          sourceUrl: espnResult.source ?? null,
          resolvedByUserId: null,
        });

        if (!result.ok) {
          console.error("[auto-resolve] resolveMarket (ESPN) failed", {
            marketId: market.id,
            reason: result.reason,
            detail: result.detail,
          });
          skipped.push({
            marketId: market.id,
            title: market.title,
            reason: `Resolve failed (ESPN): ${result.reason}`,
          });
          continue;
        }

        autoResolved.push({
          marketId: market.id,
          title: market.title,
          outcome: espnResult.outcome,
          confidence: espnResult.confidence,
          reasoning: espnResult.reasoning,
          method: "ESPN",
        });
        continue;
      }

      if (espnResult && !espnResult.resolved) {
        // ESPN found the game wasn't played yet, or couldn't match — skip Claude for Sports
        // unless it's a non-game-specific question (championships, season totals, etc.)
        const isGameSpecific =
          /\bbeat\b|\bdefeat\b|\bwin\b.*\bagainst\b|\bvs\b/i.test(market.title);
        if (isGameSpecific) {
          skipped.push({
            marketId: market.id,
            title: market.title,
            reason: `ESPN: ${espnResult.reasoning}`,
          });
          continue;
        }
        // Non-game-specific sports question — fall through to Claude
      }
    }

    // ── Step 2: Claude fallback ──
    let resolution: ClaudeResolution;
    try {
      resolution = await resolveWithClaude(market, apiKey);
    } catch (err) {
      skipped.push({
        marketId: market.id,
        title: market.title,
        reason: `Claude error: ${
          err instanceof Error ? err.message : "unknown"
        }`,
      });
      continue;
    }

    if (
      resolution.confidence >= CONFIDENCE_AUTO &&
      resolution.outcome !== "unknown"
    ) {
      // Auto-resolve via Claude
      const aiNote = `AI_AUTO_RESOLVED [${resolution.confidence}% confidence]: ${resolution.reasoning}`;
      const result = await resolveMarket(supabase, {
        marketId: market.id,
        outcome: resolution.outcome,
        resolutionNote: aiNote,
        sourceUrl: resolution.source_hint ?? null,
        resolvedByUserId: null,
      });

      if (!result.ok) {
        console.error("[auto-resolve] resolveMarket (AI) failed", {
          marketId: market.id,
          reason: result.reason,
          detail: result.detail,
        });
        skipped.push({
          marketId: market.id,
          title: market.title,
          reason: `Resolve failed (AI): ${result.reason}`,
        });
        continue;
      }

      autoResolved.push({
        marketId: market.id,
        title: market.title,
        outcome: resolution.outcome,
        confidence: resolution.confidence,
        reasoning: resolution.reasoning,
        method: "AI",
      });
    } else if (resolution.confidence >= CONFIDENCE_REVIEW) {
      // Flag for review — store Claude's analysis but don't resolve.
      // This is a metadata-only update; market stays open. Kept as a
      // direct UPDATE because it's NOT a resolution event.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
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
