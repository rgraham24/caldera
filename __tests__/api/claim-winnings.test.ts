import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mocks BEFORE imports ───────────────────────────────────
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: Date.now() + 60_000,
  }),
}));

vi.mock("@/lib/deso/transferDeso", () => ({
  transferDeso: vi.fn(),
}));

vi.mock("@/lib/deso/solvency", () => ({
  checkDesoSolvency: vi.fn(),
}));

// Supabase chainable mocks. Each table's chain is mocked separately.
const userSingleMock = vi.fn();
const payoutSingleMock = vi.fn();
const payoutLockMock = vi.fn(); // UPDATE that returns rows (the in_flight lock)
const payoutSimpleUpdateMock = vi.fn(); // UPDATE that doesn't return data
                                          // (blocked_insolvent, failed, claimed)

const fromMock = vi.fn((table: string) => {
  if (table === "users") {
    return {
      select: () => ({
        eq: () => ({ maybeSingle: userSingleMock }),
      }),
    };
  }
  if (table === "position_payouts") {
    return {
      // SELECT path
      select: () => ({
        eq: () => ({ maybeSingle: payoutSingleMock }),
      }),
      // UPDATE path — branches by chain shape
      update: () => ({
        eq: (_col: string, _val: unknown) => {
          // Two final UPDATE shapes:
          //   - .update(...).eq("id", X)            → resolves to {error}
          //   - .update(...).eq("id", X).in(...).select() → resolves to {data, error}
          // Use a Proxy-like return: chainable + thenable.
          return {
            then: (
              resolve: (v: { error: { message: string } | null }) => unknown
            ) => Promise.resolve(payoutSimpleUpdateMock()).then(resolve),
            in: (_col: string, _vals: unknown[]) => ({
              select: (_cols: string) => payoutLockMock(),
            }),
          };
        },
      }),
    };
  }
  throw new Error(`unexpected table: ${table}`);
});

const serviceClientMock = { from: fromMock };

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => serviceClientMock),
}));

// Mock global fetch for DeSo exchange-rate API
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { POST } from "@/app/api/positions/[id]/claim-winnings/route";
import { getAuthenticatedUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { transferDeso } from "@/lib/deso/transferDeso";
import { checkDesoSolvency } from "@/lib/deso/solvency";

const PUBKEY = "BC1YLhriEzhGkrKzUGmL3B4Zdq9S63oGVSYMhUV1UT5vDoRieHceZBB";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_USER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const POSITION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PAYOUT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const MARKET_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const mockedAuth = getAuthenticatedUser as ReturnType<typeof vi.fn>;
const mockedRL = checkRateLimit as ReturnType<typeof vi.fn>;
const mockedTransfer = transferDeso as ReturnType<typeof vi.fn>;
const mockedSolvency = checkDesoSolvency as ReturnType<typeof vi.fn>;

function makeReq() {
  return new Request(
    `http://localhost/api/positions/${POSITION_ID}/claim-winnings`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }
  );
}

function paramsPromise(id: string = POSITION_ID) {
  return { params: Promise.resolve({ id }) };
}

function pendingPayout(overrides: Record<string, unknown> = {}) {
  return {
    id: PAYOUT_ID,
    position_id: POSITION_ID,
    user_id: USER_ID,
    market_id: MARKET_ID,
    payout_amount_usd: 5.0,
    claim_status: "pending",
    ...overrides,
  };
}

beforeEach(() => {
  mockedAuth.mockReset().mockReturnValue({ publicKey: PUBKEY });
  mockedRL.mockReset().mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: Date.now() + 60_000,
  });
  mockedTransfer.mockReset();
  mockedSolvency.mockReset();
  fromMock.mockClear();

  userSingleMock.mockReset().mockResolvedValue({
    data: { id: USER_ID },
    error: null,
  });
  payoutSingleMock.mockReset().mockResolvedValue({
    data: pendingPayout(),
    error: null,
  });
  payoutSimpleUpdateMock.mockReset().mockResolvedValue({ error: null });
  payoutLockMock.mockReset().mockResolvedValue({
    data: [{ id: PAYOUT_ID }],
    error: null,
  });

  fetchMock.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({ USDCentsPerDeSoExchangeRate: 500 }), // $5/DESO
  });

  process.env.DESO_PLATFORM_PUBLIC_KEY = "BC1YLPLATFORM";
  process.env.DESO_PLATFORM_SEED = "deadbeef".repeat(16);
});

describe("POST /api/positions/[id]/claim-winnings", () => {
  it("Gate 1: bad UUID → 400 bad-position-id", async () => {
    const res = await POST(
      new Request("http://localhost/api/positions/not-a-uuid/claim-winnings", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "not-a-uuid" }) }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("bad-position-id");
  });

  it("Gate 2: unauthenticated → 401", async () => {
    mockedAuth.mockReturnValue(null);
    const res = await POST(makeReq(), paramsPromise());
    expect(res.status).toBe(401);
  });

  it("Gate 3: rate limit denies → 429", async () => {
    mockedRL.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });
    const res = await POST(makeReq(), paramsPromise());
    expect(res.status).toBe(429);
  });

  it("Platform env missing → 503 platform-wallet-unavailable", async () => {
    delete process.env.DESO_PLATFORM_PUBLIC_KEY;
    const res = await POST(makeReq(), paramsPromise());
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe("platform-wallet-unavailable");
  });

  it("Gate 4: user not found → 404 user-not-found", async () => {
    userSingleMock.mockResolvedValue({ data: null, error: null });
    const res = await POST(makeReq(), paramsPromise());
    expect(res.status).toBe(404);
    expect((await res.json()).reason).toBe("user-not-found");
  });

  it("Gate 5: payout not found → 404 no-payout", async () => {
    payoutSingleMock.mockResolvedValue({ data: null, error: null });
    const res = await POST(makeReq(), paramsPromise());
    expect(res.status).toBe(404);
    expect((await res.json()).reason).toBe("no-payout");
  });

  it("Gate 6: ownership mismatch → 403 not-owner", async () => {
    payoutSingleMock.mockResolvedValue({
      data: pendingPayout({ user_id: OTHER_USER_ID }),
      error: null,
    });
    const res = await POST(makeReq(), paramsPromise());
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe("not-owner");
  });

  it("Gate 7: status='claimed' → 409 not-claimable", async () => {
    payoutSingleMock.mockResolvedValue({
      data: pendingPayout({ claim_status: "claimed" }),
      error: null,
    });
    const res = await POST(makeReq(), paramsPromise());
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe("not-claimable");
  });

  it("Gate 7: status='in_flight' → 409 not-claimable", async () => {
    payoutSingleMock.mockResolvedValue({
      data: pendingPayout({ claim_status: "in_flight" }),
      error: null,
    });
    const res = await POST(makeReq(), paramsPromise());
    expect(res.status).toBe(409);
  });

  it("Gate 7: status='blocked_insolvent' → 409 not-claimable", async () => {
    payoutSingleMock.mockResolvedValue({
      data: pendingPayout({ claim_status: "blocked_insolvent" }),
      error: null,
    });
    const res = await POST(makeReq(), paramsPromise());
    expect(res.status).toBe(409);
  });

  it("Gate 7 retry: status='failed' is allowed (proceeds to settle)", async () => {
    payoutSingleMock.mockResolvedValue({
      data: pendingPayout({ claim_status: "failed" }),
      error: null,
    });
    mockedSolvency.mockResolvedValue({
      ok: true,
      available: BigInt(9_000_000_000),
    });
    mockedTransfer.mockResolvedValue({
      ok: true,
      txHashHex: "deadbeef",
      feeNanos: BigInt(168),
    });
    const res = await POST(makeReq(), paramsPromise());
    expect(res.status).toBe(200);
  });

  it("Gate 8: price fetch fails → 503 price-fetch-failed", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    const res = await POST(makeReq(), paramsPromise());
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe("price-fetch-failed");
  });

  it("Gate 8: tiny payout → 400 amount-too-small", async () => {
    // payout_amount_usd = 0.000001, at $5/DESO → 200 nanos < 1000 floor
    payoutSingleMock.mockResolvedValue({
      data: pendingPayout({ payout_amount_usd: 0.000001 }),
      error: null,
    });
    const res = await POST(makeReq(), paramsPromise());
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("amount-too-small");
  });

  it("Gate 9: platform insolvent → 503 + marks blocked_insolvent", async () => {
    mockedSolvency.mockResolvedValue({
      ok: false,
      reason: "insufficient",
      required: BigInt(1_000_000_000),
      available: BigInt(100_000),
    });
    const res = await POST(makeReq(), paramsPromise());
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe("platform-insufficient-funds");
    expect(payoutSimpleUpdateMock).toHaveBeenCalled();
  });

  it("Gate 9: solvency fetch failed → 503 solvency-fetch-failed", async () => {
    mockedSolvency.mockResolvedValue({
      ok: false,
      reason: "fetch-failed",
      required: BigInt(1_000_000_000),
      detail: "DeSo API down",
    });
    const res = await POST(makeReq(), paramsPromise());
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe("solvency-fetch-failed");
  });

  it("Gate 10: concurrent claim race → 409 concurrent-claim", async () => {
    mockedSolvency.mockResolvedValue({
      ok: true,
      available: BigInt(9_000_000_000),
    });
    payoutLockMock.mockResolvedValue({ data: [], error: null }); // 0 rows
    const res = await POST(makeReq(), paramsPromise());
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe("concurrent-claim");
  });

  it("Gate 11: transferDeso fails → 500 + marks failed", async () => {
    mockedSolvency.mockResolvedValue({
      ok: true,
      available: BigInt(9_000_000_000),
    });
    mockedTransfer.mockResolvedValue({
      ok: false,
      reason: "submit-failed",
      detail: "DeSo network error",
    });
    const res = await POST(makeReq(), paramsPromise());
    expect(res.status).toBe(500);
    expect((await res.json()).reason).toBe("transfer-failed");
    expect(payoutSimpleUpdateMock).toHaveBeenCalled();
  });

  it("Gate 12: post-send ledger update fails → 500 ledger-update-failed", async () => {
    mockedSolvency.mockResolvedValue({
      ok: true,
      available: BigInt(9_000_000_000),
    });
    mockedTransfer.mockResolvedValue({
      ok: true,
      txHashHex: "deadbeef",
      feeNanos: BigInt(168),
    });
    payoutSimpleUpdateMock.mockResolvedValue({
      error: { message: "ledger update failed" },
    });
    const res = await POST(makeReq(), paramsPromise());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.reason).toBe("ledger-update-failed");
    expect(body.txHashHex).toBe("deadbeef");
  });

  it("Happy path: 200 with full response shape", async () => {
    mockedSolvency.mockResolvedValue({
      ok: true,
      available: BigInt(9_000_000_000),
    });
    mockedTransfer.mockResolvedValue({
      ok: true,
      txHashHex: "deadbeef",
      feeNanos: BigInt(168),
    });
    const res = await POST(makeReq(), paramsPromise());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.payoutId).toBe(PAYOUT_ID);
    expect(body.positionId).toBe(POSITION_ID);
    expect(body.txHashHex).toBe("deadbeef");
    expect(body.payoutUsd).toBe(5.0);
    expect(body.payoutNanos).toBe("1000000000"); // 5 / 5 * 1e9
    expect(body.desoUsdRate).toBe(5);
  });
});
