import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const CODE_TTL_MS = 48 * 60 * 60 * 1000;

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "CALDERA-";
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
  // Service role: anonymous visitors hit this to start a claim on
  // someone else's reserved profile, so we cannot rely on the caller
  // having a Supabase session that satisfies the creators-table RLS
  // policy on UPDATE.
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: creator } = await (supabase as any)
    .from("creators")
    .select("id, tier, claim_code, claim_code_expires_at")
    .eq("slug", slug)
    .single();

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }
  if (creator.tier !== "unclaimed") {
    return NextResponse.json({ error: "Profile already claimed" }, { status: 400 });
  }

  // Reuse the existing code if it's still valid — avoids invalidating
  // a link a visitor already shared and prevents pointless writes if
  // multiple visitors land on the page at once.
  const existingExpiry = creator.claim_code_expires_at
    ? new Date(creator.claim_code_expires_at).getTime()
    : 0;
  if (creator.claim_code && existingExpiry > Date.now()) {
    return NextResponse.json({
      data: {
        code: creator.claim_code,
        expiresAt: creator.claim_code_expires_at,
      },
    });
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("creators")
    .update({ claim_code: code, claim_code_expires_at: expiresAt })
    .eq("id", creator.id);

  return NextResponse.json({ data: { code, expiresAt } });
}
