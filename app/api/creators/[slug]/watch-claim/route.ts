import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: creator } = await supabase
    .from("creators")
    .select("id")
    .eq("slug", slug)
    .single();

  if (!creator) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await (supabase as any).from("creator_claim_watchers").upsert({
    creator_id: creator.id,
    user_id: user.id,
  }, { onConflict: "creator_id,user_id" });

  // Update count
  const { count } = await (supabase as any)
    .from("creator_claim_watchers")
    .select("*", { count: "exact", head: true })
    .eq("creator_id", creator.id);

  await supabase
    .from("creators")
    .update({ claim_watcher_count: count || 0 })
    .eq("id", creator.id);

  return NextResponse.json({ data: { watching: true, count: count || 0 } });
}
