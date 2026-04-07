import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const desoPublicKey = req.nextUrl.searchParams.get("desoPublicKey");

  if (!desoPublicKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  const { data: dbUser } = await supabase
    .from("users")
    .select("id")
    .eq("deso_public_key", desoPublicKey)
    .single();

  if (!dbUser) {
    return NextResponse.json({ data: [] });
  }

  const { data: positions, error } = await supabase
    .from("positions")
    .select("*, market:markets(*)")
    .eq("user_id", dbUser.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: positions });
}
