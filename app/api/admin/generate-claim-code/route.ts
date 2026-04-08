// NOTE: Run supabase/migrations/20260408_claim_codes_table.sql first
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ADMIN_PASSWORD = "caldera-admin-2026";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

function generateCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "0123456789";
  let part1 = "";
  let part2 = "";
  for (let i = 0; i < 4; i++) part1 += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 4; i++) part2 += digits[Math.floor(Math.random() * digits.length)];
  return `CALDERA-${part1}-${part2}`;
}

// POST /api/admin/generate-claim-code
// Body: { adminPassword, slug } OR { adminPassword, bulk: true } for top 20 unclaimed
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.adminPassword !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://caldera.market";

  // Bulk mode: generate for top 20 unclaimed creators
  if (body.bulk) {
    const { data: unclaimed } = await supabase
      .from("creators")
      .select("slug, name")
      .in("token_status", ["shadow", "active_unverified", "needs_review"])
      .order("markets_count", { ascending: false })
      .limit(20);

    const results = [];
    for (const creator of (unclaimed ?? [])) {
      // Check if code already exists
      const { data: existing } = await (supabase as DB)
        .from("claim_codes")
        .select("code")
        .eq("slug", creator.slug)
        .eq("status", "pending")
        .maybeSingle();

      if (existing) {
        results.push({
          slug: creator.slug,
          code: existing.code,
          claimUrl: `${appUrl}/claim/${existing.code}`,
          reused: true,
        });
        continue;
      }

      let code = generateCode();
      // Ensure uniqueness
      for (let attempts = 0; attempts < 5; attempts++) {
        const { data: clash } = await (supabase as DB)
          .from("claim_codes")
          .select("id")
          .eq("code", code)
          .maybeSingle();
        if (!clash) break;
        code = generateCode();
      }

      await (supabase as DB).from("claim_codes").insert({ slug: creator.slug, code, status: "pending" });
      results.push({ slug: creator.slug, code, claimUrl: `${appUrl}/claim/${code}` });
    }

    return NextResponse.json({ data: { generated: results.length, results } });
  }

  // Single mode
  const { slug } = body;
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const { data: creator } = await supabase
    .from("creators")
    .select("id, name, slug, creator_coin_symbol, deso_username")
    .eq("slug", slug)
    .single();

  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 });

  let code = generateCode();
  for (let attempts = 0; attempts < 5; attempts++) {
    const { data: clash } = await (supabase as DB)
      .from("claim_codes")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (!clash) break;
    code = generateCode();
  }

  const { error } = await (supabase as DB)
    .from("claim_codes")
    .insert({ slug, code, status: "pending" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const claimUrl = `${appUrl}/claim/${code}`;
  return NextResponse.json({ data: { code, slug, claimUrl } });
}

// GET /api/admin/generate-claim-code?adminPassword=X — list all codes
export async function GET(req: NextRequest) {
  const pw = req.nextUrl.searchParams.get("adminPassword");
  if (pw !== ADMIN_PASSWORD) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://caldera.market";

  const { data, error } = await (supabase as DB)
    .from("claim_codes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r: DB) => ({
    ...r,
    claimUrl: `${appUrl}/claim/${r.code}`,
  }));

  return NextResponse.json({ data: rows });
}
