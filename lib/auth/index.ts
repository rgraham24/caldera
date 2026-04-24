/**
 * Auth helper for API routes.
 *
 * Middleware (middleware.ts) verifies the session cookie and stamps the
 * validated DeSo public key onto the x-deso-pubkey request header.
 * API routes should call getAuthenticatedUser() instead of reading the
 * cookie themselves — it reads the header that middleware already set.
 *
 * Usage:
 *   const user = getAuthenticatedUser(req);
 *   if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   // user.publicKey is now safe to use
 */

import { type NextRequest } from "next/server";

export const AUTH_HEADER = "x-deso-pubkey";

export type AuthenticatedUser = {
  publicKey: string;
};

/**
 * Returns the authenticated user derived from the middleware-stamped header,
 * or null if the request is unauthenticated.
 *
 * Never reads the raw cookie — always trusts the header set by middleware.
 */
export function getAuthenticatedUser(
  req: NextRequest | Request
): AuthenticatedUser | null {
  const pubKey = req.headers.get(AUTH_HEADER);
  if (!pubKey) return null;
  return { publicKey: pubKey };
}
