import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_KEYS } from "@/lib/admin/market-generator";

// Keywords that indicate a legitimately scheduled far-future event
const SCHEDULED_EVENT_KEYWORDS = [
  "championship",
  "election",
  "award",
  "season",
  "world cup",
  "super bowl",
  "nba finals",
];

// Returns a random ISO date string between 30 and 90 days from April 7 2026
function randomNearTermDate(): string {
  const base = new Date("2026-04-07T00:00:00Z");
  const days = 30 + Math.floor(Math.random() * 61); // 30–90
  base.setDate(base.getDate() + days);
  return base.toISOString();
}

function hasScheduledKeyword(title: string): boolean {
  const lower = title.toLowerCase();
  return SCHEDULED_EVENT_KEYWORDS.some((kw) => lower.includes(kw));
}

export async function POST(req: NextRequest) {
  try {
    const { desoPublicKey, adminPassword } = await req.json();

    const isAdmin =
      ADMIN_KEYS.includes(desoPublicKey || "") ||
      (process.env.ADMIN_PASSWORD && adminPassword === process.env.ADMIN_PASSWORD);

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = await createClient();

    // Fetch open markets with stale far-future dates
    const { data: markets, error } = await supabase
      .from("markets")
      .select("id, title, resolve_at")
      .eq("status", "open")
      .gt("resolve_at", "2026-09-01T00:00:00Z");

    if (error) {
      return NextResponse.json({ error: "Failed to fetch markets" }, { status: 500 });
    }

    const stale = (markets ?? []).filter((m) => !hasScheduledKeyword(m.title));

    let updated = 0;
    for (const market of stale) {
      const { error: updateError } = await supabase
        .from("markets")
        .update({ resolve_at: randomNearTermDate(), updated_at: new Date().toISOString() })
        .eq("id", market.id);

      if (!updateError) updated++;
    }

    return NextResponse.json({ data: { updated, scanned: (markets ?? []).length } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
