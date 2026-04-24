/**
 * Session cookie HMAC-SHA256 signing — Node runtime only.
 *
 * Used by API routes (which run in Node). NOT safe to import from
 * Edge middleware — imports node:crypto at module level.
 *
 * For verification (Edge-compatible), see cookie-verify.ts.
 */

import { createHmac } from "node:crypto";

export type SessionPayload = {
  publicKey: string;
  iat: number;
  exp: number;
};

const MIN_KEY_BYTES = 32;

export function assertKey(key: string): void {
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

function toBase64Url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b.toString("base64url");
}

export function signCookie(payload: SessionPayload, key: string): string {
  assertKey(key);
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = toBase64Url(payloadJson);
  const mac = createHmac("sha256", key).update(payloadB64).digest();
  const macB64 = toBase64Url(mac);
  return `${macB64}.${payloadB64}`;
}
