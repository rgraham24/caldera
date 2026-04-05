import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { desoPublicKey } = await req.json();

  if (!desoPublicKey) {
    return NextResponse.json({ error: "DeSo public key required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: creator } = await supabase
    .from("creators")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  if (creator.tier !== "unclaimed") {
    return NextResponse.json({ error: "Profile already claimed or is a public figure" }, { status: 400 });
  }

  if (creator.deso_public_key && creator.deso_public_key !== desoPublicKey) {
    return NextResponse.json(
      { error: "This DeSo account doesn't match this creator's profile" },
      { status: 403 }
    );
  }

  const now = new Date().toISOString();
  await supabase
    .from("creators")
    .update({
      tier: "verified_creator",
      claimed_at: now,
      deso_public_key: desoPublicKey,
      total_creator_earnings: (creator.total_creator_earnings || 0) + (creator.unclaimed_earnings_escrow || 0),
      unclaimed_earnings_escrow: 0,
    })
    .eq("id", creator.id);

  return NextResponse.json({ data: { claimed: true } });
}
