import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { url } = await req.json();

  if (!url) return NextResponse.json({ error: "URL required" }, { status: 400 });

  const supabase = await createClient();

  const { data: creator } = await supabase
    .from("creators")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  if (!creator.claim_code) return NextResponse.json({ error: "No claim code generated" }, { status: 400 });

  if (creator.claim_code_expires_at && new Date(creator.claim_code_expires_at) < new Date()) {
    return NextResponse.json({ error: "Claim code expired. Generate a new one." }, { status: 400 });
  }

  // Fetch the URL and scan for the code
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "CalderaBot/1.0" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error("Could not access URL");
    const html = await res.text();

    if (!html.includes(creator.claim_code)) {
      return NextResponse.json(
        { error: "Code not found at that URL. Make sure it's publicly visible." },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Could not access that URL. Make sure it's publicly accessible." },
      { status: 400 }
    );
  }

  // Claim successful
  const now = new Date().toISOString();
  await supabase
    .from("creators")
    .update({
      tier: "verified_creator",
      claimed_at: now,
      claim_code: null,
      claim_code_expires_at: null,
      total_creator_earnings:
        (creator.total_creator_earnings || 0) + (creator.unclaimed_earnings_escrow || 0),
      unclaimed_earnings_escrow: 0,
    })
    .eq("id", creator.id);

  return NextResponse.json({ data: { success: true } });
}
