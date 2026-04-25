import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock verifyDesoJwt so we test ONLY the freshness layer.
// verifyFreshDesoJwt lives in lib/auth/fresh-jwt.ts and imports
// verifyDesoJwt from lib/auth/deso-jwt.ts. By mocking deso-jwt,
// the static import in fresh-jwt.ts picks up vi.fn() at module load
// time. We import verifyFreshDesoJwt directly from fresh-jwt.ts to
// avoid the importOriginal bypass-registry limitation (importOriginal
// isolates module loads so vi.mock intercept does not reach them).
vi.mock("@/lib/auth/deso-jwt", () => ({
  verifyDesoJwt: vi.fn(),
}));

import { verifyFreshDesoJwt } from "@/lib/auth/fresh-jwt";
import { verifyDesoJwt } from "@/lib/auth/deso-jwt";

const validPublicKey = "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7";

// Build a minimal JWT for testing: header.payload.sig.
// Only the payload (middle) is decoded by verifyFreshDesoJwt; sig is
// what verifyDesoJwt (mocked) "validates."
function makeJwt(payload: Record<string, unknown>): string {
  const header = { alg: "ES256", typ: "JWT" };
  const enc = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${enc(header)}.${enc(payload)}.fakesig`;
}

const mockedVerifyDesoJwt = verifyDesoJwt as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedVerifyDesoJwt.mockReset();
});

describe("verifyFreshDesoJwt — happy path", () => {
  it("returns ok:true when JWT is valid and iat is recent", async () => {
    mockedVerifyDesoJwt.mockResolvedValue({
      ok: true,
      publicKey: validPublicKey,
    });
    const now = Math.floor(Date.now() / 1000);
    const jwt = makeJwt({ iat: now - 10 });

    const result = await verifyFreshDesoJwt(jwt, validPublicKey, {
      nowFn: () => now,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.publicKey).toBe(validPublicKey);
  });

  it("accepts iat at the exact recency boundary", async () => {
    mockedVerifyDesoJwt.mockResolvedValue({
      ok: true,
      publicKey: validPublicKey,
    });
    const now = 1_000_000_000;
    const jwt = makeJwt({ iat: now - 60 }); // exactly maxAge

    const result = await verifyFreshDesoJwt(jwt, validPublicKey, {
      nowFn: () => now,
      maxAgeSeconds: 60,
    });

    expect(result.ok).toBe(true);
  });

  it("accepts iat slightly in the future within clock skew", async () => {
    mockedVerifyDesoJwt.mockResolvedValue({
      ok: true,
      publicKey: validPublicKey,
    });
    const now = 1_000_000_000;
    const jwt = makeJwt({ iat: now + 3 }); // within default skew of 5

    const result = await verifyFreshDesoJwt(jwt, validPublicKey, {
      nowFn: () => now,
    });
    expect(result.ok).toBe(true);
  });
});

describe("verifyFreshDesoJwt — recency failures", () => {
  it("rejects iat older than maxAgeSeconds with reason=stale", async () => {
    mockedVerifyDesoJwt.mockResolvedValue({
      ok: true,
      publicKey: validPublicKey,
    });
    const now = 1_000_000_000;
    const jwt = makeJwt({ iat: now - 90 });

    const result = await verifyFreshDesoJwt(jwt, validPublicKey, {
      nowFn: () => now,
      maxAgeSeconds: 60,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("stale");
      expect(result.detail).toMatch(/age=\d+s/);
    }
  });

  it("rejects iat just past the boundary as stale", async () => {
    mockedVerifyDesoJwt.mockResolvedValue({
      ok: true,
      publicKey: validPublicKey,
    });
    const now = 1_000_000_000;
    const jwt = makeJwt({ iat: now - 61 });

    const result = await verifyFreshDesoJwt(jwt, validPublicKey, {
      nowFn: () => now,
      maxAgeSeconds: 60,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("stale");
  });

  it("rejects iat far in the future as future-issued", async () => {
    mockedVerifyDesoJwt.mockResolvedValue({
      ok: true,
      publicKey: validPublicKey,
    });
    const now = 1_000_000_000;
    const jwt = makeJwt({ iat: now + 600 });

    const result = await verifyFreshDesoJwt(jwt, validPublicKey, {
      nowFn: () => now,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("future-issued");
      expect(result.detail).toMatch(/iat=\d+/);
    }
  });

  it("respects custom maxAgeSeconds", async () => {
    mockedVerifyDesoJwt.mockResolvedValue({
      ok: true,
      publicKey: validPublicKey,
    });
    const now = 1_000_000_000;
    const jwt = makeJwt({ iat: now - 25 });

    const tight = await verifyFreshDesoJwt(jwt, validPublicKey, {
      nowFn: () => now,
      maxAgeSeconds: 20,
    });
    expect(tight.ok).toBe(false);
    if (!tight.ok) expect(tight.reason).toBe("stale");

    const loose = await verifyFreshDesoJwt(jwt, validPublicKey, {
      nowFn: () => now,
      maxAgeSeconds: 30,
    });
    expect(loose.ok).toBe(true);
  });

  it("respects custom clockSkewSeconds", async () => {
    mockedVerifyDesoJwt.mockResolvedValue({
      ok: true,
      publicKey: validPublicKey,
    });
    const now = 1_000_000_000;
    const jwt = makeJwt({ iat: now + 10 });

    const tight = await verifyFreshDesoJwt(jwt, validPublicKey, {
      nowFn: () => now,
      clockSkewSeconds: 5,
    });
    expect(tight.ok).toBe(false);
    if (!tight.ok) expect(tight.reason).toBe("future-issued");

    const loose = await verifyFreshDesoJwt(jwt, validPublicKey, {
      nowFn: () => now,
      clockSkewSeconds: 15,
    });
    expect(loose.ok).toBe(true);
  });
});

describe("verifyFreshDesoJwt — payload validation", () => {
  it("rejects JWT with missing iat as missing-iat", async () => {
    mockedVerifyDesoJwt.mockResolvedValue({
      ok: true,
      publicKey: validPublicKey,
    });
    const jwt = makeJwt({ sub: "abc" });

    const result = await verifyFreshDesoJwt(jwt, validPublicKey);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing-iat");
  });

  it("rejects JWT with non-numeric iat as missing-iat", async () => {
    mockedVerifyDesoJwt.mockResolvedValue({
      ok: true,
      publicKey: validPublicKey,
    });
    const jwt = makeJwt({ iat: "not-a-number" });

    const result = await verifyFreshDesoJwt(jwt, validPublicKey);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing-iat");
  });

  it("rejects malformed JWT (wrong number of parts)", async () => {
    mockedVerifyDesoJwt.mockResolvedValue({
      ok: true,
      publicKey: validPublicKey,
    });

    const result = await verifyFreshDesoJwt("not.a.valid.jwt", validPublicKey);
    // Note: verifyDesoJwt is mocked to return ok:true above. Real
    // verifyDesoJwt would reject the malformed JWT first; here we test
    // the fallback path where our parse fails.
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid-jwt");
  });
});

describe("verifyFreshDesoJwt — base verifyDesoJwt failures", () => {
  it("propagates derived-key-invalid reason", async () => {
    mockedVerifyDesoJwt.mockResolvedValue({
      ok: false,
      reason: "derived-key-invalid",
      detail: "DeSo says key is not active",
    });
    const jwt = makeJwt({ iat: Math.floor(Date.now() / 1000) });

    const result = await verifyFreshDesoJwt(jwt, validPublicKey);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("derived-key-invalid");
      expect(result.detail).toContain("DeSo");
    }
  });

  it("maps any other base failure reason to invalid-jwt", async () => {
    mockedVerifyDesoJwt.mockResolvedValue({
      ok: false,
      reason: "signature-mismatch",
      detail: "ECDSA verify failed",
    });
    const jwt = makeJwt({ iat: Math.floor(Date.now() / 1000) });

    const result = await verifyFreshDesoJwt(jwt, validPublicKey);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid-jwt");
      expect(result.detail).toContain("ECDSA");
    }
  });
});
