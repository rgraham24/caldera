import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── mocks ────────────────────────────────────────────────────────────
// We mock verifyCookie so these tests exercise middleware routing logic
// without re-testing the crypto layer (covered by cookie.test.ts).

const mockVerifyCookie = vi.fn();
vi.mock("@/lib/auth/cookie", () => ({
  verifyCookie: (...args: unknown[]) => mockVerifyCookie(...args),
}));

import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { AUTH_HEADER } from "@/lib/auth/index";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookie-helpers";

// ─── helpers ──────────────────────────────────────────────────────────

const VALID_PK = "BC1YLgU3MCy5iBsKMHGrfdpZGGwJFEJhAXNmhCDMBFfDMBnCjc8hpNQ";
const SIGNING_KEY = "dK7n2FhG9pQ8_wR3sLpY5vKmXtZ4bC1eN6oUjH0aI2M";

function makeReq(opts: {
  cookieValue?: string;
  incomingAuthHeader?: string;
}): NextRequest {
  const headers = new Headers();
  if (opts.incomingAuthHeader) {
    headers.set(AUTH_HEADER, opts.incomingAuthHeader);
  }
  if (opts.cookieValue !== undefined) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${opts.cookieValue}`);
  }
  return new NextRequest("http://localhost/api/trades", { headers });
}

beforeEach(() => {
  mockVerifyCookie.mockReset();
  process.env.COOKIE_SIGNING_KEY = SIGNING_KEY;
});

// ─── tests ────────────────────────────────────────────────────────────

describe("middleware — auth header stripping", () => {
  it("strips a spoofed x-deso-pubkey header even when no cookie is present", async () => {
    const req = makeReq({ incomingAuthHeader: "spoofed-key" });
    const res = await middleware(req as never);
    // NextResponse.next() returns a response whose request headers we can
    // inspect indirectly by reading the x-middleware-request-* header that
    // Next.js propagates. In unit tests we check the internal header bag via
    // the response's own headers — specifically the forwarded header map.
    expect(res.headers.get(`x-middleware-request-${AUTH_HEADER}`)).toBeNull();
  });
});

describe("middleware — unauthenticated requests", () => {
  it("passes through without auth header when no cookie is present", async () => {
    const req = makeReq({});
    const res = await middleware(req as never);
    expect(res.headers.get(`x-middleware-request-${AUTH_HEADER}`)).toBeNull();
  });

  it("passes through without auth header when cookie is empty string", async () => {
    const req = makeReq({ cookieValue: "" });
    const res = await middleware(req as never);
    expect(res.headers.get(`x-middleware-request-${AUTH_HEADER}`)).toBeNull();
  });

  it("passes through without auth header when verifyCookie returns null", async () => {
    mockVerifyCookie.mockResolvedValue(null);
    const req = makeReq({ cookieValue: "bad.cookie" });
    const res = await middleware(req as never);
    expect(res.headers.get(`x-middleware-request-${AUTH_HEADER}`)).toBeNull();
    expect(mockVerifyCookie).toHaveBeenCalledWith("bad.cookie", SIGNING_KEY);
  });

  it("passes through without auth header when COOKIE_SIGNING_KEY is absent", async () => {
    delete process.env.COOKIE_SIGNING_KEY;
    const req = makeReq({ cookieValue: "some.cookie" });
    const res = await middleware(req as never);
    expect(res.headers.get(`x-middleware-request-${AUTH_HEADER}`)).toBeNull();
    // verifyCookie should NOT be called — no point without a key
    expect(mockVerifyCookie).not.toHaveBeenCalled();
  });

  it("passes through without auth header when verifyCookie throws", async () => {
    mockVerifyCookie.mockRejectedValue(new Error("unexpected"));
    const req = makeReq({ cookieValue: "some.cookie" });
    const res = await middleware(req as never);
    expect(res.headers.get(`x-middleware-request-${AUTH_HEADER}`)).toBeNull();
  });
});

describe("middleware — authenticated requests", () => {
  it("stamps x-deso-pubkey when cookie is valid", async () => {
    mockVerifyCookie.mockResolvedValue({
      publicKey: VALID_PK,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const req = makeReq({ cookieValue: "valid.cookie" });
    const res = await middleware(req as never);
    expect(res.headers.get(`x-middleware-request-${AUTH_HEADER}`)).toBe(VALID_PK);
  });

  it("stamps correct key even when a spoofed header was also sent", async () => {
    mockVerifyCookie.mockResolvedValue({
      publicKey: VALID_PK,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const req = makeReq({
      cookieValue: "valid.cookie",
      incomingAuthHeader: "attacker-key",
    });
    const res = await middleware(req as never);
    // Must be the verified key, not the attacker's value.
    expect(res.headers.get(`x-middleware-request-${AUTH_HEADER}`)).toBe(VALID_PK);
  });
});
