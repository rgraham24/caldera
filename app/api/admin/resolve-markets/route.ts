import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveExpiredMarkets } from "@/lib/admin/pipeline";

export async function POST(req: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const { password } = await req.json().catch(() => ({}));
  if (adminPassword && password !== adminPassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 500 });

  const supabase = await createClient();
  const result = await resolveExpiredMarkets(apiKey, supabase);
  return NextResponse.json({ success: true, ...result });
}
