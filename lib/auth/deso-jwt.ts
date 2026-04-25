/**
 * DeSo JWT verification for P2-1 auth middleware.
 *
 * Verifies a JWT produced by deso-protocol's identity.jwt() and confirms
 * the signing derived key is authorized for the claimed owner public key.
 *
 * Security model: the JWT payload contains derivedPublicKeyBase58Check,
 * not the owner public key. Verification requires two steps:
 *   1. Signature math: JWT was signed by the private key matching the
 *      derived public key in the payload. Proves control of the derived key.
 *   2. DeSo API binding: the derived key is registered as IsValid=true for
 *      the claimed owner public key. Proves the derived key is authorized.
 *
 * Both checks must pass. Either alone is insufficient.
 *
 * See docs/P2-1-auth-middleware-design.md for the full design rationale.
 */

import { verifyAsync } from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";

// DeSo mainnet public key prefix (3 bytes), prepended before base58check.
const DESO_MAINNET_PREFIX = new Uint8Array([0xcd, 0x14, 0x00]);
const PUBKEY_DECODED_LENGTH = 40; // 3 prefix + 33 pubkey + 4 checksum
const PUBKEY_RAW_LENGTH = 33;
const CHECKSUM_LENGTH = 4;
const JWT_SIGNATURE_LENGTH = 64; // ES256 JOSE format: 32-byte R + 32-byte S

const DEFAULT_DESO_API_BASE = "https://node.deso.org";
const CLOCK_SKEW_SECONDS = 30;
const REPLAY_WINDOW_SECONDS = 300;

export type VerifiedDesoJwt = {
  ownerPublicKey: string;
  derivedPublicKey: string;
  iat: number;
  exp: number;
};

export type VerifyResult =
  | { ok: true; payload: VerifiedDesoJwt }
  | { ok: false; reason: string };

export type VerifyOptions = {
  fetchImpl?: typeof fetch;
  desoApiBase?: string;
  now?: () => number; // unix seconds
};

/**
 * Verify a DeSo JWT proves control of the claimed owner public key.
 * Returns tagged result; never throws on untrusted input.
 */
export async function verifyDesoJwt(
  jwt: string,
  ownerPublicKey: string,
  options: VerifyOptions = {}
): Promise<VerifyResult> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const apiBase = options.desoApiBase ?? DEFAULT_DESO_API_BASE;
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));

  if (typeof jwt !== "string" || !jwt) {
    return { ok: false, reason: "jwt missing" };
  }
  if (typeof ownerPublicKey !== "string" || !ownerPublicKey) {
    return { ok: false, reason: "ownerPublicKey missing" };
  }

  // 1. Parse JWT structure
  const parts = jwt.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed jwt" };
  const [headerPart, payloadPart, sigPart] = parts;
  if (!headerPart || !payloadPart || !sigPart) {
    return { ok: false, reason: "malformed jwt" };
  }

  // 2. Decode header + payload
  const header = parseBase64UrlJson(headerPart);
  if (!header) return { ok: false, reason: "malformed jwt header" };
  if (header.alg !== "ES256") return { ok: false, reason: "unsupported alg" };
  if (header.typ !== "JWT") return { ok: false, reason: "unsupported typ" };

  const payload = parseBase64UrlJson(payloadPart);
  if (!payload) return { ok: false, reason: "malformed jwt payload" };

  const derivedPk = payload.derivedPublicKeyBase58Check;
  const iat = payload.iat;
  const exp = payload.exp;

  if (typeof derivedPk !== "string" || !derivedPk) {
    return { ok: false, reason: "payload missing derivedPublicKeyBase58Check" };
  }
  if (typeof iat !== "number") return { ok: false, reason: "payload iat missing" };
  if (typeof exp !== "number") return { ok: false, reason: "payload exp missing" };

  // 3. Clock checks
  const nowSec = now();
  if (exp <= nowSec) return { ok: false, reason: "jwt expired" };
  if (iat > nowSec + CLOCK_SKEW_SECONDS) return { ok: false, reason: "jwt iat in future" };
  if (iat < nowSec - REPLAY_WINDOW_SECONDS) {
    return { ok: false, reason: "jwt too old (possible replay)" };
  }

  // 4. Decode signature (must be 64 bytes JOSE compact)
  const sigBytes = base64UrlDecode(sigPart);
  if (!sigBytes) return { ok: false, reason: "malformed signature" };
  if (sigBytes.length !== JWT_SIGNATURE_LENGTH) {
    return { ok: false, reason: "signature wrong length" };
  }

  // 5. Decode derived pubkey from base58check → raw 33-byte compressed
  const derivedKeyBytes = decodeDesoPublicKey(derivedPk);
  if (!derivedKeyBytes) return { ok: false, reason: "malformed derivedPublicKey" };

  // 6. Verify signature over SHA-256(headerPart + "." + payloadPart)
  const signingInput = `${headerPart}.${payloadPart}`;
  const msgHash = sha256(new TextEncoder().encode(signingInput));

  let sigValid = false;
  try {
    sigValid = await verifyAsync(sigBytes, msgHash, derivedKeyBytes, {
      prehash: false,
    });
  } catch {
    return { ok: false, reason: "signature verify threw" };
  }
  if (!sigValid) return { ok: false, reason: "signature invalid" };

  // 7. Cross-check binding: derived key must be IsValid for claimed owner
  const bindingOk = await checkDerivedKeyBinding(
    ownerPublicKey,
    derivedPk,
    apiBase,
    fetchImpl
  );
  if (!bindingOk.ok) return { ok: false, reason: bindingOk.reason };

  return {
    ok: true,
    payload: { ownerPublicKey, derivedPublicKey: derivedPk, iat, exp },
  };
}

// ─── internals ─────────────────────────────────────────────────────────

function base64UrlDecode(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    return new Uint8Array(Buffer.from(s, "base64url"));
  } catch {
    return null;
  }
}

function parseBase64UrlJson(s: string): Record<string, unknown> | null {
  const bytes = base64UrlDecode(s);
  if (!bytes) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Decode a DeSo base58check public key string to raw 33-byte compressed
 * secp256k1 pubkey bytes. Verifies the checksum. Returns null on any failure.
 */
function decodeDesoPublicKey(b58: string): Uint8Array | null {
  let decoded: Uint8Array;
  try {
    decoded = bs58.decode(b58);
  } catch {
    return null;
  }
  if (decoded.length !== PUBKEY_DECODED_LENGTH) return null;

  // Check prefix matches mainnet
  for (let i = 0; i < DESO_MAINNET_PREFIX.length; i++) {
    if (decoded[i] !== DESO_MAINNET_PREFIX[i]) return null;
  }

  // Verify checksum = first 4 bytes of SHA256(SHA256(prefix + pubkey))
  const body = decoded.slice(0, decoded.length - CHECKSUM_LENGTH);
  const providedChecksum = decoded.slice(decoded.length - CHECKSUM_LENGTH);
  const computedChecksum = sha256(sha256(body)).slice(0, CHECKSUM_LENGTH);
  for (let i = 0; i < CHECKSUM_LENGTH; i++) {
    if (providedChecksum[i] !== computedChecksum[i]) return null;
  }

  // Raw pubkey: strip 3-byte prefix and 4-byte checksum
  return decoded.slice(DESO_MAINNET_PREFIX.length, DESO_MAINNET_PREFIX.length + PUBKEY_RAW_LENGTH);
}

/**
 * Call DeSo's get-single-derived-key endpoint and check IsValid.
 * Fail closed: any non-200, any shape mismatch, any thrown error → reject.
 */
async function checkDerivedKeyBinding(
  ownerPublicKey: string,
  derivedPublicKey: string,
  apiBase: string,
  fetchImpl: typeof fetch
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const url = `${apiBase}/api/v0/get-single-derived-key/${ownerPublicKey}/${derivedPublicKey}`;
  let resp: Response;
  try {
    resp = await fetchImpl(url, { method: "GET" });
  } catch {
    return { ok: false, reason: "deso api unreachable" };
  }
  if (!resp.ok) return { ok: false, reason: `deso api status ${resp.status}` };

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    return { ok: false, reason: "deso api non-json response" };
  }

  if (!body || typeof body !== "object") {
    return { ok: false, reason: "deso api malformed body" };
  }
  const derivedKey = (body as { DerivedKey?: { IsValid?: unknown } }).DerivedKey;
  if (!derivedKey || typeof derivedKey !== "object") {
    return { ok: false, reason: "deso api missing DerivedKey" };
  }
  if (derivedKey.IsValid !== true) {
    return { ok: false, reason: "derived key not authorized for owner" };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────
// P2-5: Fresh-JWT recency check — re-exported from fresh-jwt.ts.
// Implementation lives in a separate file so vi.mock("@/lib/auth/deso-jwt")
// can intercept verifyDesoJwt calls made inside verifyFreshDesoJwt.
// ─────────────────────────────────────────────────────────────────
export {
  verifyFreshDesoJwt,
  type FreshJwtVerifyResult,
  type FreshJwtFailReason,
  type FreshJwtVerifyOptions,
} from "./fresh-jwt";
