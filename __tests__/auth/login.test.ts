import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── mocks ────────────────────────────────────────────────────────────
// We mock the Supabase client creator AND the JWT verifier so tests
// don't hit real DeSo or a real DB. The route under test is pure glue.

const mockSupabaseFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: mockSupabaseFrom,
  })),
}));

const mockVerifyDesoJwt = vi.fn();
vi.mock("@/lib/auth/deso-jwt", () => ({
  verifyDesoJwt: (...args: unknown[]) => mockVerifyDesoJwt(...args),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// Must set before route module is first imported (route reads env at
// runtime from process.env, not at import time, so setting here is OK).
process.env.COOKIE_SIGNING_KEY =
  "dK7n2FhG9pQ8_wR3sLpY5vKmXtZ4bC1eN6oUjH0aI2M"; // 32+ bytes base64url

import { POST as loginPOST } from "@/app/api/auth/deso-login/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import { verifyCookie } from "@/lib/auth/cookie-verify";
import { type SessionPayload } from "@/lib/auth/cookie-sign";

// ─── helpers ──────────────────────────────────────────────────────────

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/auth/deso-login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setSupabaseMocks(opts: {
  existingUser?: { id: string } | null;
  insertResult?: { data?: unknown; error?: { message: string } | null };
}) {
  mockSupabaseFrom.mockImplementation((table: string) => {
    if (table !== "users") throw new Error(`unexpected table: ${table}`);
    return {
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: opts.existingUser ?? null,
            error: opts.existingUser ? null : { code: "PGRST116" },
          }),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: async () => opts.insertResult ?? { data: null, error: null },
        }),
      }),
    };
  });
}

const VALID_PK = "BC1YLgU3MCy5iBsKMHGrfdpZGGwJFEJhAXNmhCDMBFfDMBnCjc8hpNQ";
const DERIVED_PK = "BC1YLj77tYGXG6a6pV3zoU8K27vM3xF3zBWHpL6aXZMhYDYP2dkCk2J";
const VALID_JWT = "fake.jwt.signature"; // contents don't matter, verifier is mocked

beforeEach(() => {
  mockSupabaseFrom.mockReset();
  mockVerifyDesoJwt.mockReset();
  // Default: rate limit allows through
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4, resetAt: Date.now() + 60_000 });
});

// ─── tests ────────────────────────────────────────────────────────────

describe("POST /api/auth/deso-login", () => {
  it("returns 400 when publicKey is missing", async () => {
    const res = await loginPOST(makeReq({ desoJwt: VALID_JWT }) as unknown as Parameters<typeof loginPOST>[0]);
    expect(res.status).toBe(400);
  });

  it("returns 400 when desoJwt is missing", async () => {
    const res = await loginPOST(makeReq({ publicKey: VALID_PK }) as unknown as Parameters<typeof loginPOST>[0]);
    expect(res.status).toBe(400);
  });

  it("returns 401 when JWT verification fails", async () => {
    mockVerifyDesoJwt.mockResolvedValue({ ok: false, reason: "signature invalid" });
    setSupabaseMocks({ existingUser: null });
    const res = await loginPOST(makeReq({ publicKey: VALID_PK, desoJwt: VALID_JWT }) as unknown as Parameters<typeof loginPOST>[0]);
    expect(res.status).toBe(401);
  });

  it("returns 200 and sets a signed cookie when user exists", async () => {
    mockVerifyDesoJwt.mockResolvedValue({
      ok: true,
      payload: { ownerPublicKey: VALID_PK, derivedPublicKey: DERIVED_PK, iat: 0, exp: 0 },
    });
    setSupabaseMocks({ existingUser: { id: "user-123", deso_public_key: VALID_PK } as never });
    const res = await loginPOST(makeReq({ publicKey: VALID_PK, desoJwt: VALID_JWT }) as unknown as Parameters<typeof loginPOST>[0]);
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("caldera-session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Max-Age=604800");

    // Extract cookie value and round-trip through verifyCookie
    const match = setCookie!.match(/caldera-session=([^;]+)/);
    expect(match).toBeTruthy();
    const cookieValue = match![1];
    const verified = await verifyCookie(cookieValue, process.env.COOKIE_SIGNING_KEY!);
    expect(verified).not.toBeNull();
    expect((verified as SessionPayload).publicKey).toBe(VALID_PK);
  });

  it("returns 201 when a new user is created", async () => {
    mockVerifyDesoJwt.mockResolvedValue({
      ok: true,
      payload: { ownerPublicKey: VALID_PK, derivedPublicKey: DERIVED_PK, iat: 0, exp: 0 },
    });
    setSupabaseMocks({
      existingUser: null,
      insertResult: { data: { id: "user-new", deso_public_key: VALID_PK } as never, error: null },
    });
    const res = await loginPOST(makeReq({ publicKey: VALID_PK, desoJwt: VALID_JWT, username: "bob" }) as unknown as Parameters<typeof loginPOST>[0]);
    expect(res.status).toBe(201);
    expect(res.headers.get("set-cookie")).toContain("caldera-session=");
  });

  it("returns 500 when user insert fails", async () => {
    mockVerifyDesoJwt.mockResolvedValue({
      ok: true,
      payload: { ownerPublicKey: VALID_PK, derivedPublicKey: DERIVED_PK, iat: 0, exp: 0 },
    });
    setSupabaseMocks({
      existingUser: null,
      insertResult: { data: null, error: { message: "unique violation" } },
    });
    const res = await loginPOST(makeReq({ publicKey: VALID_PK, desoJwt: VALID_JWT }) as unknown as Parameters<typeof loginPOST>[0]);
    expect(res.status).toBe(500);
  });
});

describe("POST /api/auth/logout", () => {
  it("returns 200 and sets a clearing cookie", async () => {
    const res = await logoutPOST();
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("caldera-session=");
    expect(setCookie).toContain("Max-Age=0");
  });
});

// ─── P2-3.4: per-IP rate limiting ─────────────────────────────────────

function makeReqWithHeaders(body: unknown, headers: Record<string, string>): Request {
  return new Request("http://localhost/api/auth/deso-login", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/deso-login — P2-3.4 rate limiting", () => {
  it("returns 429 with headers when rate limit is exceeded", async () => {
    const resetAt = Date.now() + 30_000;
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt });
    const res = await loginPOST(
      makeReqWithHeaders({ publicKey: VALID_PK, desoJwt: VALID_JWT }, { "x-forwarded-for": "1.2.3.4" }) as unknown as Parameters<typeof loginPOST>[0]
    );
    expect(res.status).toBe(429);
    const body = await res.json() as { error: string; resetAt: number };
    expect(body.error).toBe("Too many login attempts");
    expect(body.resetAt).toBe(resetAt);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(res.headers.get("X-RateLimit-Reset")).toBe(String(resetAt));
  });

  it("reads IP from x-forwarded-for (first entry)", async () => {
    mockVerifyDesoJwt.mockResolvedValue({ ok: false, reason: "irrelevant" });
    await loginPOST(
      makeReqWithHeaders({ publicKey: VALID_PK, desoJwt: VALID_JWT }, { "x-forwarded-for": "10.0.0.1, 10.0.0.2" }) as unknown as Parameters<typeof loginPOST>[0]
    );
    expect(mockCheckRateLimit).toHaveBeenCalledWith("login-ip:10.0.0.1", "login");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", async () => {
    mockVerifyDesoJwt.mockResolvedValue({ ok: false, reason: "irrelevant" });
    await loginPOST(
      makeReqWithHeaders({ publicKey: VALID_PK, desoJwt: VALID_JWT }, { "x-real-ip": "5.6.7.8" }) as unknown as Parameters<typeof loginPOST>[0]
    );
    expect(mockCheckRateLimit).toHaveBeenCalledWith("login-ip:5.6.7.8", "login");
  });

  it("falls back to 'unknown' when no IP header is present", async () => {
    mockVerifyDesoJwt.mockResolvedValue({ ok: false, reason: "irrelevant" });
    await loginPOST(
      makeReqWithHeaders({ publicKey: VALID_PK, desoJwt: VALID_JWT }, {}) as unknown as Parameters<typeof loginPOST>[0]
    );
    expect(mockCheckRateLimit).toHaveBeenCalledWith("login-ip:unknown", "login");
  });
});
