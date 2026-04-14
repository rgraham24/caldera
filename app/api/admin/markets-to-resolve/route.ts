import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_KEYS } from "@/lib/admin/market-generator";

export async function GET(req: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD ?? "caldera-admin-2026";
  const { searchParams } = new URL(req.url);
  const pw = searchParams.get("adminPassword");
  const dk = searchParams.get("desoPublicKey");
  const authHeader = req.headers.get("authorization");

  const isAdmin =
    ADMIN_KEYS.includes(dk || "") ||
    pw === adminPassword ||
    authHeader === `Bearer ${adminPassword}`;

  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  // Overdue open non-crypto markets
  const { data: markets } = await supabase
    .from("markets")
    .select("id, title, category, creator_slug, yes_price, no_price, total_volume, resolve_at, description")
    .eq("status", "open")
    .lt("resolve_at", now)
    .neq("category", "Crypto")
    .is("resolution_outcome", null)
    .order("resolve_at", { ascending: true })
    .limit(50);

  if (!markets || markets.length === 0) {
    return NextResponse.json({ data: [] });
  }

  // Attach open position count per market
  const enriched = await Promise.all(
    markets.map(async (m) => {
      const { count } = await supabase
        .from("positions")
        .select("id", { count: "exact", head: true })
        .eq("market_id", m.id)
        .eq("status", "open");

      const daysOverdue = m.resolve_at
        ? Math.floor(
            (Date.now() - new Date(m.resolve_at).getTime()) / (1000 * 60 * 60 * 24)
          )
        : 0;

      return { ...m, open_positions_count: count ?? 0, days_overdue: daysOverdue };
    })
  );

  return NextResponse.json({ data: enriched });
}

// Also support POST with body for convenience
export async function POST(req: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD ?? "caldera-admin-2026";
  const body = await req.json().catch(() => ({}));
  const isAdmin =
    ADMIN_KEYS.includes(body.desoPublicKey || "") ||
    body.adminPassword === adminPassword;
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Redirect logic to GET
  const fakeReq = new NextRequest(
    new URL(`/api/admin/markets-to-resolve?adminPassword=${adminPassword}`, "https://caldera.market"),
    { method: "GET" }
  );
  return GET(fakeReq);
}
