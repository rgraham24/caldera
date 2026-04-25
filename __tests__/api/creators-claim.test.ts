import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock getAuthenticatedUser BEFORE importing the route
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(),
  AUTH_HEADER: "x-deso-pubkey",
}));

// Mock verifyFreshDesoJwt. Use simple factory (no importOriginal) so
// the vi.fn() is the binding that the route module picks up at load time.
vi.mock("@/lib/auth/deso-jwt", () => ({
  verifyFreshDesoJwt: vi.fn(),
}));

// Mock supabase — needed only for the "body pubkey ignored" test where
// auth passes and the route proceeds to DB logic.
const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }));
const mockFrom = vi.fn((table: string) => {
  if (table === "creators") return { select: mockSelect, update: mockUpdate };
  return { select: mockSelect, update: mockUpdate };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}));

import { POST } from "@/app/api/creators/[slug]/claim/route";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyFreshDesoJwt } from "@/lib/auth/deso-jwt";

const PUBKEY = "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7";

const mockedAuth = getAuthenticatedUser as ReturnType<typeof vi.fn>;
const mockedFresh = verifyFreshDesoJwt as ReturnType<typeof vi.fn>;

// Next.js 15 routes receive params as a Promise
const makeParams = (slug = "test-slug") =>
  ({ params: Promise.resolve({ slug }) }) as never;

function makeReq(body: unknown) {
  return new Request("http://localhost/api/creators/test-slug/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

beforeEach(() => {
  mockedAuth.mockReset();
  mockedFresh.mockReset();
  mockSingle.mockReset();
});

describe("POST /api/creators/[slug]/claim — P2-5.3 fresh JWT auth", () => {
  it("returns 401 when not authenticated (no cookie)", async () => {
    mockedAuth.mockReturnValue(null);
    const req = makeReq({ desoJwt: "irrelevant" });

    const res = await POST(req as never, makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 401 when desoJwt is missing from body", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    const req = makeReq({});

    const res = await POST(req as never, makeParams());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.reason).toBe("missing-jwt");
  });

  it("returns 401 when desoJwt is invalid", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedFresh.mockResolvedValue({ ok: false, reason: "invalid-jwt" });
    const req = makeReq({ desoJwt: "bad.jwt.here" });

    const res = await POST(req as never, makeParams());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.reason).toBe("invalid-jwt");
  });

  it("returns 401 when desoJwt is stale", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedFresh.mockResolvedValue({ ok: false, reason: "stale" });
    const req = makeReq({ desoJwt: "stale.jwt.value" });

    const res = await POST(req as never, makeParams());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.reason).toBe("stale");
  });

  it("verifies JWT against the authed publicKey, not body-supplied", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedFresh.mockResolvedValue({ ok: true, publicKey: PUBKEY });

    // Simulate DB: creator exists and is unclaimed
    mockSingle.mockResolvedValue({
      data: {
        id: "creator-1",
        tier: "unclaimed",
        deso_public_key: PUBKEY,
        total_creator_earnings: 0,
        unclaimed_earnings_escrow: 0,
      },
      error: null,
    });

    const wrongPubkey = "BC1YOTHERFAKEPUBKEYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    const req = makeReq({
      desoJwt: "some.jwt",
      desoPublicKey: wrongPubkey, // attempt to override — must be ignored
    });

    await POST(req as never, makeParams());

    // verifyFreshDesoJwt was called with the COOKIE pubkey, not the
    // attacker-supplied body pubkey
    expect(mockedFresh).toHaveBeenCalledWith("some.jwt", PUBKEY);
  });
});
