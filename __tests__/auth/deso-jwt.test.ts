import { describe, it, expect } from "vitest";
import { verifyDesoJwt } from "@/lib/auth/deso-jwt";
import { signAsync, getPublicKey } from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";

// ─── test helpers ──────────────────────────────────────────────────────

const DESO_PREFIX = new Uint8Array([0xcd, 0x14, 0x00]);

function toBase64Url(bytes: Uint8Array | string): string {
  const buf = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : Buffer.from(bytes);
  return buf.toString("base64url");
}

/**
 * Encode a raw 33-byte secp256k1 compressed pubkey as a DeSo base58check
 * public key string: [prefix][pubkey][checksum]
 */
function encodeDesoPublicKey(rawPubKey: Uint8Array): string {
  if (rawPubKey.length !== 33) throw new Error("test helper: pubkey must be 33 bytes");
  const body = new Uint8Array(DESO_PREFIX.length + rawPubKey.length);
  body.set(DESO_PREFIX, 0);
  body.set(rawPubKey, DESO_PREFIX.length);
  const checksum = sha256(sha256(body)).slice(0, 4);
  const full = new Uint8Array(body.length + checksum.length);
  full.set(body, 0);
  full.set(checksum, body.length);
  return bs58.encode(full);
}

/**
 * Produce a DeSo-shaped JWT the same way deso-protocol's getSignedJWT does:
 * - ES256 header
 * - payload with derivedPublicKeyBase58Check, iat, exp
 * - signature over SHA256(header.payload)
 * - 64-byte JOSE-format signature (compact R||S), base64url
 */
async function makeDesoJwt(opts: {
  derivedSeed: Uint8Array;
  derivedPubBase58: string;
  iat: number;
  exp: number;
  alg?: string;
  typ?: string;
  corruptSig?: boolean;
  corruptPayload?: boolean;
}): Promise<string> {
  const header = { alg: opts.alg ?? "ES256", typ: opts.typ ?? "JWT" };
  const payload = {
    derivedPublicKeyBase58Check: opts.derivedPubBase58,
    iat: opts.iat,
    exp: opts.exp,
  };
  const headerB64 = toBase64Url(JSON.stringify(header));
  let payloadB64 = toBase64Url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const msgHash = sha256(new TextEncoder().encode(signingInput));
  const sig = await signAsync(msgHash, opts.derivedSeed, {
    prehash: false,
    format: "compact",
  });
  const sigBytes = sig instanceof Uint8Array ? sig : (sig as { toBytes: () => Uint8Array }).toBytes();
  let sigB64 = toBase64Url(sigBytes);
  if (opts.corruptSig) {
    // flip the first character to break the signature
    sigB64 = (sigB64[0] === "A" ? "B" : "A") + sigB64.slice(1);
  }
  if (opts.corruptPayload) {
    payloadB64 = (payloadB64[0] === "A" ? "B" : "A") + payloadB64.slice(1);
  }
  return `${headerB64}.${payloadB64}.${sigB64}`;
}

function randomSeed(): Uint8Array {
  const s = new Uint8Array(32);
  crypto.getRandomValues(s);
  return s;
}

function freshKeypair() {
  const seed = randomSeed();
  const pub = getPublicKey(seed, true); // compressed
  const b58 = encodeDesoPublicKey(pub);
  return { seed, pub, b58 };
}

function mockFetch(impl: (url: string) => Partial<Response>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const parts = impl(url);
    const status = parts.status ?? 200;
    const body = (parts as { _body?: unknown })._body;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
}

function okFetch(): typeof fetch {
  return mockFetch(() => ({ status: 200, _body: { DerivedKey: { IsValid: true } } }));
}

// ─── fixtures ──────────────────────────────────────────────────────────

const OWNER_PK = "BC1YLgU3MCy5iBsKMHGrfdpZGGwJFEJhAXNmhCDMBFfDMBnCjc8hpNQ";
const NOW = 1713910000;
const iat = NOW - 10;
const exp = NOW + 1800;

// ─── tests ─────────────────────────────────────────────────────────────

describe("verifyDesoJwt — happy path", () => {
  it("verifies a valid JWT with IsValid=true from DeSo API", async () => {
    const dk = freshKeypair();
    const jwt = await makeDesoJwt({ derivedSeed: dk.seed, derivedPubBase58: dk.b58, iat, exp });
    const r = await verifyDesoJwt(jwt, OWNER_PK, { fetchImpl: okFetch(), now: () => NOW });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.ownerPublicKey).toBe(OWNER_PK);
      expect(r.payload.derivedPublicKey).toBe(dk.b58);
      expect(r.payload.iat).toBe(iat);
      expect(r.payload.exp).toBe(exp);
    }
  });
});

describe("verifyDesoJwt — input validation", () => {
  it("rejects empty jwt", async () => {
    const r = await verifyDesoJwt("", OWNER_PK, { fetchImpl: okFetch(), now: () => NOW });
    expect(r.ok).toBe(false);
  });

  it("rejects empty ownerPublicKey", async () => {
    const dk = freshKeypair();
    const jwt = await makeDesoJwt({ derivedSeed: dk.seed, derivedPubBase58: dk.b58, iat, exp });
    const r = await verifyDesoJwt(jwt, "", { fetchImpl: okFetch(), now: () => NOW });
    expect(r.ok).toBe(false);
  });

  it("rejects malformed jwt (wrong number of parts)", async () => {
    const r = await verifyDesoJwt("a.b", OWNER_PK, { fetchImpl: okFetch(), now: () => NOW });
    expect(r.ok).toBe(false);
  });
});

describe("verifyDesoJwt — header/payload validation", () => {
  it("rejects alg other than ES256", async () => {
    const dk = freshKeypair();
    const jwt = await makeDesoJwt({
      derivedSeed: dk.seed, derivedPubBase58: dk.b58, iat, exp, alg: "HS256",
    });
    const r = await verifyDesoJwt(jwt, OWNER_PK, { fetchImpl: okFetch(), now: () => NOW });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/alg/i);
  });

  it("rejects typ other than JWT", async () => {
    const dk = freshKeypair();
    const jwt = await makeDesoJwt({
      derivedSeed: dk.seed, derivedPubBase58: dk.b58, iat, exp, typ: "JOSE",
    });
    const r = await verifyDesoJwt(jwt, OWNER_PK, { fetchImpl: okFetch(), now: () => NOW });
    expect(r.ok).toBe(false);
  });

  it("rejects payload missing derivedPublicKeyBase58Check", async () => {
    const headerB64 = toBase64Url(JSON.stringify({ alg: "ES256", typ: "JWT" }));
    const payloadB64 = toBase64Url(JSON.stringify({ iat, exp }));
    const sigB64 = toBase64Url(new Uint8Array(64));
    const jwt = `${headerB64}.${payloadB64}.${sigB64}`;
    const r = await verifyDesoJwt(jwt, OWNER_PK, { fetchImpl: okFetch(), now: () => NOW });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/derivedPublicKey/i);
  });
});

describe("verifyDesoJwt — clock checks", () => {
  it("rejects expired jwt", async () => {
    const dk = freshKeypair();
    const jwt = await makeDesoJwt({
      derivedSeed: dk.seed, derivedPubBase58: dk.b58,
      iat: NOW - 3600, exp: NOW - 1,
    });
    const r = await verifyDesoJwt(jwt, OWNER_PK, { fetchImpl: okFetch(), now: () => NOW });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/expired/i);
  });

  it("rejects iat in future (beyond skew)", async () => {
    const dk = freshKeypair();
    const jwt = await makeDesoJwt({
      derivedSeed: dk.seed, derivedPubBase58: dk.b58,
      iat: NOW + 120, exp: NOW + 1800,
    });
    const r = await verifyDesoJwt(jwt, OWNER_PK, { fetchImpl: okFetch(), now: () => NOW });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/future/i);
  });

  it("rejects iat older than replay window", async () => {
    const dk = freshKeypair();
    const jwt = await makeDesoJwt({
      derivedSeed: dk.seed, derivedPubBase58: dk.b58,
      iat: NOW - 600, exp: NOW + 1800,
    });
    const r = await verifyDesoJwt(jwt, OWNER_PK, { fetchImpl: okFetch(), now: () => NOW });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/old|replay/i);
  });
});

describe("verifyDesoJwt — signature/pubkey validation", () => {
  it("rejects tampered signature", async () => {
    const dk = freshKeypair();
    const jwt = await makeDesoJwt({
      derivedSeed: dk.seed, derivedPubBase58: dk.b58, iat, exp, corruptSig: true,
    });
    const r = await verifyDesoJwt(jwt, OWNER_PK, { fetchImpl: okFetch(), now: () => NOW });
    expect(r.ok).toBe(false);
  });

  it("rejects tampered payload (signature no longer matches)", async () => {
    const dk = freshKeypair();
    const jwt = await makeDesoJwt({
      derivedSeed: dk.seed, derivedPubBase58: dk.b58, iat, exp, corruptPayload: true,
    });
    const r = await verifyDesoJwt(jwt, OWNER_PK, { fetchImpl: okFetch(), now: () => NOW });
    expect(r.ok).toBe(false);
  });

  it("rejects malformed derivedPublicKey", async () => {
    const dk = freshKeypair();
    const jwt = await makeDesoJwt({
      derivedSeed: dk.seed, derivedPubBase58: "not-a-real-b58-pubkey", iat, exp,
    });
    const r = await verifyDesoJwt(jwt, OWNER_PK, { fetchImpl: okFetch(), now: () => NOW });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/derivedPublicKey|malformed/i);
  });
});

describe("verifyDesoJwt — DeSo API binding", () => {
  it("rejects when DeSo API returns IsValid=false", async () => {
    const dk = freshKeypair();
    const jwt = await makeDesoJwt({ derivedSeed: dk.seed, derivedPubBase58: dk.b58, iat, exp });
    const fetchImpl = mockFetch(() => ({ status: 200, _body: { DerivedKey: { IsValid: false } } }));
    const r = await verifyDesoJwt(jwt, OWNER_PK, { fetchImpl, now: () => NOW });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not authorized/i);
  });

  it("rejects when DeSo API returns non-200", async () => {
    const dk = freshKeypair();
    const jwt = await makeDesoJwt({ derivedSeed: dk.seed, derivedPubBase58: dk.b58, iat, exp });
    const fetchImpl = mockFetch(() => ({ status: 500 }));
    const r = await verifyDesoJwt(jwt, OWNER_PK, { fetchImpl, now: () => NOW });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/status 500/i);
  });

  it("rejects when fetch throws (network error)", async () => {
    const dk = freshKeypair();
    const jwt = await makeDesoJwt({ derivedSeed: dk.seed, derivedPubBase58: dk.b58, iat, exp });
    const fetchImpl = (async () => { throw new Error("enotfound"); }) as unknown as typeof fetch;
    const r = await verifyDesoJwt(jwt, OWNER_PK, { fetchImpl, now: () => NOW });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/unreachable/i);
  });

  it("rejects when DeSo API body is missing DerivedKey field", async () => {
    const dk = freshKeypair();
    const jwt = await makeDesoJwt({ derivedSeed: dk.seed, derivedPubBase58: dk.b58, iat, exp });
    const fetchImpl = mockFetch(() => ({ status: 200, _body: { Unrelated: true } }));
    const r = await verifyDesoJwt(jwt, OWNER_PK, { fetchImpl, now: () => NOW });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/DerivedKey/i);
  });

  it("calls the correct DeSo API URL", async () => {
    const dk = freshKeypair();
    const jwt = await makeDesoJwt({ derivedSeed: dk.seed, derivedPubBase58: dk.b58, iat, exp });
    let capturedUrl = "";
    const fetchImpl = mockFetch((url) => {
      capturedUrl = url;
      return { status: 200, _body: { DerivedKey: { IsValid: true } } };
    });
    await verifyDesoJwt(jwt, OWNER_PK, {
      fetchImpl, now: () => NOW, desoApiBase: "https://custom.deso.test",
    });
    expect(capturedUrl).toBe(
      `https://custom.deso.test/api/v0/get-single-derived-key/${OWNER_PK}/${dk.b58}`
    );
  });
});
