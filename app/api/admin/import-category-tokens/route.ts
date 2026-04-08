import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { importCategoryTokens } from "@/lib/admin/pipeline";

export async function POST(req: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const { password } = await req.json().catch(() => ({}));
  if (adminPassword && password !== adminPassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = await createClient();
  await importCategoryTokens(supabase);
  return NextResponse.json({
    success: true,
    message: "Category tokens imported as active_verified",
  });
}
