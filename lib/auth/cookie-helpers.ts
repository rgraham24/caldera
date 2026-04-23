/**
 * Cookie header helpers for the session cookie.
 * Kept separate from the crypto layer (lib/auth/cookie.ts) to avoid
 * mixing HTTP concerns with HMAC primitives.
 */

import type { SessionPayload } from "@/lib/auth/cookie";
import { signCookie } from "@/lib/auth/cookie";

export const SESSION_COOKIE_NAME = "caldera-session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

/**
 * Build a Set-Cookie header value for a fresh session.
 * Cookie flags: HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age.
 */
export function buildSetSessionCookie(
  publicKey: string,
  signingKey: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): string {
  const payload: SessionPayload = {
    publicKey,
    iat: nowSeconds,
    exp: nowSeconds + SESSION_MAX_AGE_SECONDS,
  };
  const value = signCookie(payload, signingKey);
  return serializeCookie(SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/**
 * Build a Set-Cookie header value that clears the session cookie.
 * Sets Max-Age=0 and an empty value.
 */
export function buildClearSessionCookie(): string {
  return serializeCookie(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 0,
  });
}

type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  path?: string;
  maxAge?: number;
};

function serializeCookie(name: string, value: string, opts: CookieOptions): string {
  const parts = [`${name}=${value}`];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join("; ");
}
