import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "CAL-";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  code += "-";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: creator } = await supabase
    .from("creators")
    .select("id, tier")
    .eq("slug", slug)
    .single();

  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  if (creator.tier !== "unclaimed") return NextResponse.json({ error: "Profile already claimed" }, { status: 400 });

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  await supabase
    .from("creators")
    .update({ claim_code: code, claim_code_expires_at: expiresAt })
    .eq("id", creator.id);

  return NextResponse.json({ data: { code, expiresAt } });
}
