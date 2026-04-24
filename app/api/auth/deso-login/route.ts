import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyDesoJwt } from "@/lib/auth/deso-jwt";
import { buildSetSessionCookie } from "@/lib/auth/cookie-helpers";
import { checkRateLimit } from "@/lib/rate-limit";

type LoginBody = {
  publicKey?: string;
  desoJwt?: string;
  username?: string;
  avatarUrl?: string;
};

export async function POST(req: NextRequest) {
  // ── P2-3.4: per-IP rate limit ────────────────────────────────────
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const rl = await checkRateLimit(`login-ip:${clientIp}`, "login");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts", resetAt: rl.resetAt },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset": String(rl.resetAt),
        },
      }
    );
  }
  // ── end P2-3.4 ───────────────────────────────────────────────────

  try {
    const body = (await req.json()) as LoginBody;
    const { publicKey, desoJwt, username, avatarUrl } = body;

    if (!publicKey || typeof publicKey !== "string") {
      return NextResponse.json({ error: "publicKey required" }, { status: 400 });
    }
    if (!desoJwt || typeof desoJwt !== "string") {
      return NextResponse.json({ error: "desoJwt required" }, { status: 400 });
    }

    // Cryptographically verify the caller owns the claimed wallet.
    const verify = await verifyDesoJwt(desoJwt, publicKey);
    if (!verify.ok) {
      // Log detail server-side for debugging; client gets generic message.
      console.warn("[auth/deso-login] jwt rejected:", verify.reason);
      return NextResponse.json({ error: "authentication failed" }, { status: 401 });
    }

    // JWT verified. Look up or create the Supabase user row.
    const supabase = await createClient();
    const { data: existingUser } = await supabase
      .from("users")
      .select("*")
      .eq("deso_public_key", publicKey)
      .single();

    let dbUser = existingUser;
    let status = 200;

    if (!existingUser) {
      const handle = username || `deso_${publicKey.slice(-8).toLowerCase()}`;
      const { data: newUser, error } = await supabase
        .from("users")
        .insert({
          username: handle,
          display_name: username || handle,
          deso_public_key: publicKey,
          avatar_url: avatarUrl || null,
        })
        .select()
        .single();

      if (error || !newUser) {
        console.error("[auth/deso-login] user insert failed:", error?.message);
        return NextResponse.json({ error: "user creation failed" }, { status: 500 });
      }
      dbUser = newUser;
      status = 201;
    }

    // Issue the signed session cookie.
    const signingKey = process.env.COOKIE_SIGNING_KEY;
    if (!signingKey) {
      console.error("[auth/deso-login] COOKIE_SIGNING_KEY not configured");
      return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
    }

    const cookie = buildSetSessionCookie(publicKey, signingKey);

    return NextResponse.json(
      { data: dbUser },
      { status, headers: { "Set-Cookie": cookie } }
    );
  } catch (e) {
    console.error("[auth/deso-login] unhandled error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
