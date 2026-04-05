import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // Try lookup by slug first, then by UUID
  const { data, error } = await supabase
    .from("markets")
    .select("*")
    .eq("slug", id)
    .single();

  if (!error && data) {
    return NextResponse.json({ data });
  }

  // Fallback: try by id
  const { data: byId, error: idError } = await supabase
    .from("markets")
    .select("*")
    .eq("id", id)
    .single();

  if (idError || !byId) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }

  return NextResponse.json({ data: byId });
}
