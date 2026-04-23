/**
 * Session cookie HMAC-SHA256 sign + verify.
 *
 * Cookie format: <base64url(hmac)>.<base64url(payload)>
 *
 * - signCookie returns the cookie value string
 * - verifyCookie returns the payload if valid, null otherwise
 * - Never throws on invalid cookie input; returns null instead
 * - Throws only on programmer error (missing/short signing key)
 *
 * See docs/P2-1-auth-middleware-design.md for full architecture.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type SessionPayload = {
  publicKey: string;
  iat: number;
  exp: number;
};

const MIN_KEY_BYTES = 32;

function assertKey(key: string): void {
  if (!key) {
    throw new Error("cookie signing key is missing");
  }
  // base64url-decode to count underlying bytes
  const bytes = Buffer.from(key, "base64url");
  if (bytes.length < MIN_KEY_BYTES) {
    throw new Error(
      `cookie signing key must be at least ${MIN_KEY_BYTES} bytes; got ${bytes.length}`
    );
  }
}

function toBase64Url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b.toString("base64url");
}

function fromBase64Url(s: string): Buffer | null {
  // Reject strings that contain chars outside base64url alphabet
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    return Buffer.from(s, "base64url");
  } catch {
    return null;
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function signCookie(payload: SessionPayload, key: string): string {
  assertKey(key);
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = toBase64Url(payloadJson);
  const mac = createHmac("sha256", key).update(payloadB64).digest();
  const macB64 = toBase64Url(mac);
  return `${macB64}.${payloadB64}`;
}

export function verifyCookie(
  cookie: string,
  key: string
): SessionPayload | null {
  assertKey(key);

  if (typeof cookie !== "string") return null;
  const parts = cookie.split(".");
  if (parts.length !== 2) return null;
  const [macPart, payloadPart] = parts;
  if (!macPart || !payloadPart) return null;

  const providedMac = fromBase64Url(macPart);
  if (!providedMac) return null;

  const expectedMac = createHmac("sha256", key).update(payloadPart).digest();
  if (providedMac.length !== expectedMac.length) return null;
  if (!timingSafeEqual(providedMac, expectedMac)) return null;

  const payloadBuf = fromBase64Url(payloadPart);
  if (!payloadBuf) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(payloadBuf.toString("utf8"));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;

  if (typeof p.publicKey !== "string" || !p.publicKey) return null;
  if (typeof p.iat !== "number") return null;
  if (typeof p.exp !== "number") return null;

  if (p.exp < nowSeconds()) return null;

  return { publicKey: p.publicKey, iat: p.iat, exp: p.exp };
}
