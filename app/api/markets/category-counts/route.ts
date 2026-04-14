import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/markets/category-counts
 * Returns { data: { [category_token_slug]: count } } for all open markets.
 * Used by the Tokens page to show live market counts on category token cards.
 */
export async function GET() {
  const supabase = await createClient();

  // category_token_slug is not in generated types yet — cast to any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("markets")
    .select("category_token_slug")
    .eq("status", "open")
    .not("category_token_slug", "is", null);

  if (error) {
    return NextResponse.json({ error: (error as { message: string }).message }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ category_token_slug: string }>) {
    const slug = row.category_token_slug;
    counts[slug] = (counts[slug] ?? 0) + 1;
  }

  return NextResponse.json({ data: counts });
}
