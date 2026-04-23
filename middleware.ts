/**
 * Edge Middleware — session cookie auth for all /api/* routes.
 *
 * On every /api request:
 * 1. Strip any incoming x-deso-pubkey header (spoof defense).
 * 2. Read the caldera-session cookie.
 * 3. Verify the HMAC-signed cookie (WebCrypto, edge-compatible).
 * 4. If valid: stamp x-deso-pubkey onto the request headers so downstream
 *    API routes can call getAuthenticatedUser() without touching the cookie.
 * 5. If invalid / missing: pass through without the header (routes decide
 *    whether auth is required).
 *
 * Auth is enforced per-route, not here — middleware is passive.
 */

import { NextResponse, type NextRequest } from "next/server";
import { verifyCookie, SESSION_COOKIE_NAME } from "@/lib/auth/cookie-verify";
import { AUTH_HEADER } from "@/lib/auth/index";

export async function middleware(req: NextRequest): Promise<NextResponse> {
  // Clone headers so we can mutate them.
  const requestHeaders = new Headers(req.headers);

  // 1. Strip any caller-supplied x-deso-pubkey header.
  requestHeaders.delete(AUTH_HEADER);

  // 2. Read the session cookie.
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";

  // 3. Verify (silently skip on any error — routes enforce auth).
  if (cookie) {
    const signingKey = process.env.COOKIE_SIGNING_KEY ?? "";
    if (signingKey) {
      try {
        const session = await verifyCookie(cookie, signingKey);
        if (session) {
          // 4. Stamp the validated public key for downstream routes.
          requestHeaders.set(AUTH_HEADER, session.publicKey);
        }
      } catch {
        // verifyCookie only throws on programmer error (bad key config).
        // Log and continue without auth header.
        console.error("[middleware] verifyCookie threw unexpectedly");
      }
    }
  }

  // Pass the (possibly mutated) request through.
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: "/api/:path*",
};
