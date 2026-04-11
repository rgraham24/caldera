import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateMarketsForImportedCreators, bulkGenerateAndInsert } from "@/lib/admin/pipeline";

export async function POST(req: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const { password, limit = 20, creatorSlug } = await req.json().catch(() => ({}));
  if (adminPassword && password !== adminPassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 500 });
  const supabase = await createClient();

  // Single-creator mode: generate markets for a specific creator by slug
  if (creatorSlug) {
    const { data: creator, error } = await supabase
      .from("creators")
      .select("id, slug, name")
      .eq("slug", creatorSlug)
      .maybeSingle();
    if (error || !creator) {
      return NextResponse.json({ error: `Creator not found: ${creatorSlug}` }, { status: 404 });
    }
    const created = await bulkGenerateAndInsert([creator.name], apiKey, supabase);
    // Refresh markets_count for this creator
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
    return NextResponse.json({ success: true, marketsCreated: created, creator: creator.slug });
  }

  const created = await generateMarketsForImportedCreators(apiKey, supabase, limit);
  return NextResponse.json({ success: true, marketsCreated: created });
}
