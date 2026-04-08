import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ADMIN_PASSWORD = "caldera-admin-2026";
export const maxDuration = 120;

const BATCH_SIZE = 20;
const MAX_TO_PROCESS = 100;
const FAR_FUTURE_CUTOFF = "2026-08-01T00:00:00Z";

function gatekeeperPrompt(): string {
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return `You are an extremely ruthless prediction market gatekeeper. Today is ${today}.

You MUST reject at least 30-50% of markets. Keeping everything means you failed.

AUTOMATICALLY REJECT if ANY of these are true:
- resolve_at is after 2026-08-01 (too far out)
- Title contains "in 2026" or "by end of 2026" without a specific month or week
- Title is vague: uses "ever", "someday", "eventually", "at some point", "will X ever"
- The event clearly already happened (past tense clues, dates already passed)
- No specific trigger or measurable outcome — just generic "will X do Y?"
- The person/entity has not been actively in drama/news in the last 2 weeks

KEEP only if ALL of these are true:
- resolve_at is before 2026-08-01
- Tied to something that happened or is happening RIGHT NOW (last 14 days)
- Has a specific, measurable, binary outcome
- The drama/controversy/event is still actively unfolding

Return ONLY a JSON array of the market IDs to KEEP. Example: ["id1", "id2"]
Do not include markets to reject. Reject ruthlessly — empty array is a valid answer.`;
}

function stripMarkdown(text: string): string {
  return text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
}

function parseIdArray(text: string): string[] {
  const clean = stripMarkdown(text);
  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) {
      // Handle both ["id1","id2"] and [{"id":"id1"}, ...]
      return parsed.map((x) => (typeof x === "string" ? x : x?.id)).filter(Boolean);
    }
  } catch {
    const match = clean.match(/\[[\s\S]*\]/)?.[0];
    if (match) {
      try {
        const parsed = JSON.parse(match);
        return parsed.map((x: unknown) => (typeof x === "string" ? x : (x as { id?: string })?.id)).filter(Boolean);
      } catch { /* fall through */ }
    }
  }
  return [];
}

async function runGatekeeperBatch(
  batch: { id: string; title: string; resolve_at: string | null }[],
  apiKey: string
): Promise<string[]> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001", // faster + cheaper for batch validation
      max_tokens: 512,
      system: gatekeeperPrompt(),
      messages: [
        {
          role: "user",
          content: `Filter these markets. Return only the IDs to KEEP as a JSON array:\n${JSON.stringify(
            batch.map((m) => ({ id: m.id, title: m.title, resolve_at: m.resolve_at }))
          )}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    console.warn(`[validate] Gatekeeper API error ${res.status} — keeping batch`);
    return batch.map((m) => m.id);
  }

  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? "";
  const kept = parseIdArray(text);
  console.log(`[validate] batch: kept ${kept.length}/${batch.length}`);
  return kept;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.adminPassword !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
    }

    const supabase = await createClient();

    // Fetch up to MAX_TO_PROCESS open markets, newest first
    const { data: markets, error } = await supabase
      .from("markets")
      .select("id, title, resolve_at")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(MAX_TO_PROCESS);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!markets?.length) {
      return NextResponse.json({ data: { deleted: 0, kept: 0, processed: 0, deleted_far_future: 0, message: "No markets to validate" } });
    }

    // Fetch market IDs that have real trades
    const { data: tradeRows } = await supabase
      .from("trades")
      .select("market_id")
      .in("market_id", markets.map((m) => m.id));

    const hasRealTrades = new Set((tradeRows ?? []).map((r) => r.market_id));
    const canDelete = (id: string) => !hasRealTrades.has(id);

    // Pass 1: hard-delete far-future markets (resolve_at > Aug 2026) with no real trades — no AI needed
    const farFuture = markets.filter(
      (m) => m.resolve_at && m.resolve_at > FAR_FUTURE_CUTOFF && canDelete(m.id)
    );
    let deletedFarFuture = 0;
    if (farFuture.length > 0) {
      const { error: ffErr } = await supabase
        .from("markets")
        .delete()
        .in("id", farFuture.map((m) => m.id));
      if (!ffErr) deletedFarFuture = farFuture.length;
      console.log(`[validate] deleted ${deletedFarFuture} far-future markets (resolve_at > Aug 2026)`);
    }

    // Pass 2: AI gatekeeper on remaining markets in batches
    const remaining = markets.filter(
      (m) => !farFuture.some((f) => f.id === m.id)
    );

    const allKeptIds = new Set<string>();
    const toDeleteIds: string[] = [];

    for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
      const batch = remaining.slice(i, i + BATCH_SIZE);
      const keptIds = await runGatekeeperBatch(batch, apiKey);
      const keptSet = new Set(keptIds);

      for (const m of batch) {
        if (keptSet.has(m.id)) {
          allKeptIds.add(m.id);
        } else if (canDelete(m.id)) {
          toDeleteIds.push(m.id);
        }
      }
    }

    // Delete AI-rejected markets with no real trades
    let deleted = 0;
    if (toDeleteIds.length > 0) {
      const { error: delErr } = await supabase
        .from("markets")
        .delete()
        .in("id", toDeleteIds);
      if (delErr) {
        console.error("[validate] delete error:", delErr.message);
      } else {
        deleted = toDeleteIds.length;
      }
    }

    const processed = remaining.length;
    const kept = allKeptIds.size;
    const skippedHasRealTrades = remaining.length - deleted - kept;

    const message = [
      `Processed ${processed + farFuture.length} markets`,
      `deleted ${deleted + deletedFarFuture} (${deleted} stale + ${deletedFarFuture} far-future)`,
      `kept ${kept}`,
      skippedHasRealTrades > 0 ? `skipped ${skippedHasRealTrades} with real trades` : null,
    ].filter(Boolean).join(", ");

    return NextResponse.json({
      data: { deleted, kept, processed, deleted_far_future: deletedFarFuture, skipped_has_real_trades: skippedHasRealTrades, message },
    });
  } catch (err) {
    console.error("[validate-existing-markets]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
