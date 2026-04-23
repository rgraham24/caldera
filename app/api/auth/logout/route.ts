import { NextResponse } from "next/server";
import { buildClearSessionCookie } from "@/lib/auth/cookie-helpers";

export async function POST() {
  return NextResponse.json(
    { ok: true },
    { headers: { "Set-Cookie": buildClearSessionCookie() } }
  );
}
