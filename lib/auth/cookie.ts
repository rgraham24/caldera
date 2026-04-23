/**
 * Session cookie HMAC-SHA256 sign + verify.
 *
 * Cookie format: <base64url(hmac)>.<base64url(payload)>
 *
 * - signCookie: synchronous, uses Node.js crypto (runs in API routes)
 * - verifyCookie: async, uses WebCrypto (runs in Edge middleware AND
 *   Node routes — single code path, environment-agnostic)
 *
 * Never throws on invalid cookie input; returns null instead.
 * Throws only on programmer error (missing/short signing key).
 *
 * See docs/P2-1-auth-middleware-design.md for full architecture.
 */

import { createHmac } from "node:crypto";

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
  const bytes = Buffer.from(key, "base64url");
  if (bytes.length < MIN_KEY_BYTES) {
    throw new Error(
      `cookie signing key must be at least ${MIN_KEY_BYTES} bytes; got ${bytes.length}`
    );
  }
}

function toBase64Url(buf: Buffer | string | Uint8Array): string {
  if (typeof buf === "string") return Buffer.from(buf, "utf8").toString("base64url");
  if (buf instanceof Uint8Array && !(buf instanceof Buffer)) {
    return Buffer.from(buf).toString("base64url");
  }
  return (buf as Buffer).toString("base64url");
}

function fromBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    return new Uint8Array(Buffer.from(s, "base64url"));
  } catch {
    return null;
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export function signCookie(payload: SessionPayload, key: string): string {
  assertKey(key);
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = toBase64Url(payloadJson);
  const mac = createHmac("sha256", key).update(payloadB64).digest();
  const macB64 = toBase64Url(mac);
  return `${macB64}.${payloadB64}`;
}

/**
 * Async verify using WebCrypto (works in Edge AND Node.js).
 * Runtime-agnostic so middleware can call the same function as routes.
 */
export async function verifyCookie(
  cookie: string,
  key: string
): Promise<SessionPayload | null> {
  assertKey(key);

  if (typeof cookie !== "string") return null;
  const parts = cookie.split(".");
  if (parts.length !== 2) return null;
  const [macPart, payloadPart] = parts;
  if (!macPart || !payloadPart) return null;

  const providedMac = fromBase64Url(macPart);
  if (!providedMac) return null;

  const expectedMac = await hmacSha256Webcrypto(key, payloadPart);
  if (providedMac.length !== expectedMac.length) return null;
  if (!constantTimeEqual(providedMac, expectedMac)) return null;

  const payloadBuf = fromBase64Url(payloadPart);
  if (!payloadBuf) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBuf));
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

/**
 * HMAC-SHA256 using WebCrypto. Uses the base64url-decoded key bytes
 * (same bytes Node.js's createHmac would use when given the string).
 */
async function hmacSha256Webcrypto(
  keyStr: string,
  message: string
): Promise<Uint8Array> {
  // Node and WebCrypto disagree on how createHmac("sha256", keyString)
  // converts keyString to bytes. Node treats it as UTF-8; if we want
  // sign and verify to agree, we must use identical key bytes.
  // Node's createHmac(alg, utf8str) uses Buffer.from(utf8str, "utf8").
  // We mirror that here to keep signCookie and verifyCookie compatible.
  const keyBytes = new TextEncoder().encode(keyStr);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const msgBytes = new TextEncoder().encode(message);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, msgBytes);
  return new Uint8Array(sig);
}
