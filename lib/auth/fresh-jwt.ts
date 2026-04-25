/**
 * P2-5: Fresh-JWT recency check.
 *
 * Wraps verifyDesoJwt with an iat (issued-at) recency check.
 * For high-value actions where 30-min JWT expiry is too lax.
 *
 * Lives in its own file (not deso-jwt.ts) so that tests can mock
 * @/lib/auth/deso-jwt and have the mock intercept calls from here.
 *
 * See docs/P2-5-fresh-jwt-design.md for design rationale.
 */

import { verifyDesoJwt } from "./deso-jwt";

const DEFAULT_MAX_AGE_SECONDS = 60;
const DEFAULT_CLOCK_SKEW_SECONDS = 5;

export type FreshJwtFailReason =
  | "invalid-jwt"          // signature failed or JWT malformed
  | "stale"                // iat older than maxAgeSeconds
  | "future-issued"        // iat in the future beyond clockSkew
  | "missing-iat"          // payload missing iat field
  | "derived-key-invalid"; // DeSo says derived key is not active

export type FreshJwtVerifyResult =
  | { ok: true; publicKey: string }
  | { ok: false; reason: FreshJwtFailReason; detail?: string };

export type FreshJwtVerifyOptions = {
  maxAgeSeconds?: number;
  clockSkewSeconds?: number;
  // Allow tests to inject a clock without mocking Date.now globally.
  nowFn?: () => number;
};

/**
 * Verify a DeSo JWT AND that it was issued recently.
 *
 * Strict-mode wrapper around verifyDesoJwt. Used at high-value action
 * boundaries (creator claim, winner claims, admin) per locked
 * OQ-1 hybrid auth design.
 */
export async function verifyFreshDesoJwt(
  jwt: string,
  expectedPublicKey: string,
  opts: FreshJwtVerifyOptions = {}
): Promise<FreshJwtVerifyResult> {
  const maxAge = opts.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  const skew = opts.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS;
  const now = opts.nowFn ? opts.nowFn() : Math.floor(Date.now() / 1000);

  // Run baseline verification first — same plumbing as login uses.
  // We rely on its existing failure semantics; only add NEW failures
  // for the recency check.
  const base = await verifyDesoJwt(jwt, expectedPublicKey);
  if (!base.ok) {
    // Map existing failures into our reason union.
    // Real verifyDesoJwt has no `detail` field; tests may inject one via mock.
    const detail = (base as { ok: false; reason: string; detail?: string }).detail;
    return {
      ok: false,
      reason:
        base.reason === "derived-key-invalid"
          ? "derived-key-invalid"
          : "invalid-jwt",
      detail,
    };
  }

  // Decode the payload to read iat. We don't re-verify the signature
  // (verifyDesoJwt already did). We only care about claims here.
  let payload: Record<string, unknown>;
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) {
      return { ok: false, reason: "invalid-jwt", detail: "malformed JWT" };
    }
    const payloadJson = base64UrlDecodeToString(parts[1]);
    payload = JSON.parse(payloadJson) as Record<string, unknown>;
  } catch (e) {
    return {
      ok: false,
      reason: "invalid-jwt",
      detail: e instanceof Error ? e.message : "decode failed",
    };
  }

  const iat = payload.iat;
  if (typeof iat !== "number" || !Number.isFinite(iat)) {
    return { ok: false, reason: "missing-iat" };
  }

  if (iat > now + skew) {
    return {
      ok: false,
      reason: "future-issued",
      detail: `iat=${iat} now=${now} skew=${skew}`,
    };
  }
  if (iat < now - maxAge) {
    return {
      ok: false,
      reason: "stale",
      detail: `age=${now - iat}s maxAge=${maxAge}s`,
    };
  }

  // expectedPublicKey was validated by verifyDesoJwt above; echo it back.
  return { ok: true, publicKey: expectedPublicKey };
}

// Internal: base64url decode → utf-8 string.
function base64UrlDecodeToString(s: string): string {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padNeeded = (4 - (b64.length % 4)) % 4;
  b64 += "=".repeat(padNeeded);
  if (typeof atob === "function") {
    return new TextDecoder().decode(
      Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    );
  }
  return Buffer.from(b64, "base64").toString("utf-8");
}
