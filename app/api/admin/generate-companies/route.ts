import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bulkGenerateAndInsert } from "@/lib/admin/pipeline";

const COMPANY_SLUGS = [
  "spacex", "tesla", "apple", "amazon", "google",
  "facebook", "netflix", "microsoft", "nvidia", "uber",
];

export async function POST(req: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const { password } = await req.json().catch(() => ({}));
  if (adminPassword && password !== adminPassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 500 });

  const supabase = await createClient();
  const results: Record<string, number> = {};
  let total = 0;

  for (const slug of COMPANY_SLUGS) {
    const { data: creator } = await supabase
      .from("creators")
      .select("id, slug, name")
      .eq("slug", slug)
      .maybeSingle();

    if (!creator) {
      results[slug] = 0;
      continue;
    }

    let created = 0;
    for (let i = 0; i < 4; i++) {
      created += await bulkGenerateAndInsert([creator.name], apiKey, supabase);
    }

    // Re-tag all open markets for this company creator as "Companies" so the
    // /companies page count stays accurate (the pipeline lets Claude assign
    // categories like "Tech" which the category filter misses).
    await supabase
      .from("markets")
      .update({ category: "Companies", category_token_slug: "caldera-companies" })
      .eq("creator_slug", creator.slug)
      .eq("status", "open")
      .neq("category", "Companies");

    // Refresh markets_count
    try {
      const { count } = await supabase
        .from("markets")
        .select("id", { count: "exact", head: true })
        .eq("creator_slug", creator.slug)
        .neq("status", "archived");
      await supabase
        .from("creators")
        .update({ markets_count: count ?? 0 })
        .eq("slug", creator.slug);
    } catch { /* non-critical */ }

    results[slug] = created;
    total += created;

    await new Promise((r) => setTimeout(r, 1000));
  }

  return NextResponse.json({ success: true, results, total });
}
