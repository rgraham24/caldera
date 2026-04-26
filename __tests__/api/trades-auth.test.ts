/**
 * P2-1.5 — authentication enforcement tests for trade routes.
 *
 * These test that the route handlers correctly require the
 * middleware-stamped x-deso-pubkey header and refuse unauthenticated
 * requests. They do NOT test the full trade flow end-to-end (that
 * would require Supabase + DeSo mocking far beyond this scope).
 *
 * The happy-path "authed request reaches the DB logic" case is
 * covered by asserting the 401 does NOT fire.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AUTH_HEADER } from "@/lib/auth";

// Mock everything downstream of the auth check. We only care that
// the route either (a) 401s when no header, or (b) proceeds past
// the auth check when the header is present.
const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}));

vi.mock("@/lib/fees/relevantToken", () => ({
  resolveRelevantToken: vi.fn().mockResolvedValue({ token: "bitcoin", type: "crypto" }),
}));

vi.mock("@/lib/fees/holderSnapshot", () => ({
  snapshotHolders: vi.fn(),
}));

vi.mock("@/lib/deso/buyback", () => ({
  executeTokenBuyback: vi.fn(),
}));

vi.mock("@/lib/deso/rate", () => ({
  fetchDesoUsdRate: vi.fn().mockResolvedValue(0.00001),
  usdToDesoNanos: vi.fn((usd: number, rate: number) =>
    BigInt(Math.floor((usd / rate) * 1e9))
  ),
}));

vi.mock("@/lib/deso/verifyTx", () => ({
  verifyDesoTransfer: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: Date.now() + 60_000,
  }),
}));

import { POST as tradesPOST } from "@/app/api/trades/route";
import { POST as sellPOST } from "@/app/api/trades/sell/route";
import { verifyDesoTransfer } from "@/lib/deso/verifyTx";

const TEST_PK = "BC1YLgU3MCy5iBsKMHGrfdpZGGwJFEJhAXNmhCDMBFfDMBnCjc8hpNQ";

function makeReq(
  url: string,
  body: unknown,
  opts: { authed?: boolean } = {}
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (opts.authed) headers[AUTH_HEADER] = TEST_PK;

  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe("POST /api/trades — auth enforcement", () => {
  it("returns 401 when x-deso-pubkey header is absent", async () => {
    const req = makeReq(
      "http://localhost/api/trades",
      { marketId: "m1", side: "yes", amount: 1, txnHash: "3459d59cc8efa4dc76c8802cc6b72510e7c90bf2af31da85edc8d8c2fdee6116" },
      { authed: false }
    );
    const res = await tradesPOST(req as never);
    expect(res.status).toBe(401);
  });

  it("ignores desoPublicKey in body when header is absent — still 401", async () => {
    const req = makeReq(
      "http://localhost/api/trades",
      {
        marketId: "m1",
        side: "yes",
        amount: 1,
        txnHash: "3459d59cc8efa4dc76c8802cc6b72510e7c90bf2af31da85edc8d8c2fdee6116",
        desoPublicKey: TEST_PK,
      },
      { authed: false }
    );
    const res = await tradesPOST(req as never);
    expect(res.status).toBe(401);
  });

  it("passes auth check when x-deso-pubkey header is present", async () => {
    // Route will proceed past auth, then hit the Supabase mock which
    // returns nothing, leading to a downstream error. We only assert
    // the response is NOT 401.
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: { code: "PGRST116" } }),
        }),
      }),
      insert: () => ({
        select: () => ({ single: async () => ({ data: null, error: null }) }),
      }),
    }));

    const req = makeReq(
      "http://localhost/api/trades",
      { marketId: "m1", side: "yes", amount: 1, txnHash: "3459d59cc8efa4dc76c8802cc6b72510e7c90bf2af31da85edc8d8c2fdee6116" },
      { authed: true }
    );
    const res = await tradesPOST(req as never);
    // Anything but 401 is acceptable here — we just need to prove we
    // got past the auth gate.
    expect(res.status).not.toBe(401);
  });
});

describe("POST /api/trades/sell — auth enforcement", () => {
  it("returns 401 when x-deso-pubkey header is absent", async () => {
    const req = makeReq(
      "http://localhost/api/trades/sell",
      { marketId: "m1", side: "yes", shares: 5 },
      { authed: false }
    );
    const res = await sellPOST(req as never);
    expect(res.status).toBe(401);
  });

  it("ignores desoPublicKey in body when header is absent — still 401", async () => {
    const req = makeReq(
      "http://localhost/api/trades/sell",
      {
        marketId: "m1",
        side: "yes",
        shares: 5,
        desoPublicKey: TEST_PK,
      },
      { authed: false }
    );
    const res = await sellPOST(req as never);
    expect(res.status).toBe(401);
  });

  it("passes auth check when x-deso-pubkey header is present", async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: { code: "PGRST116" } }),
        }),
      }),
    }));

    const req = makeReq(
      "http://localhost/api/trades/sell",
      { marketId: "m1", side: "yes", shares: 5 },
      { authed: true }
    );
    const res = await sellPOST(req as never);
    expect(res.status).not.toBe(401);
  });
});

const VALID_TX_HASH = "3459d59cc8efa4dc76c8802cc6b72510e7c90bf2af31da85edc8d8c2fdee6116";

describe("POST /api/trades — P2-2.4 verification", () => {
  const validBody = {
    marketId: "m1",
    side: "yes",
    amount: 1,
    txnHash: VALID_TX_HASH,
  };

  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
    (verifyDesoTransfer as ReturnType<typeof vi.fn>).mockReset();
    // Set required env vars for the verification block
    process.env.DESO_PLATFORM_PUBLIC_KEY =
      "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7";
  });

  it("rejects 400 when txnHash is missing (required by schema)", async () => {
    const { marketId, side, amount } = validBody;
    const req = makeReq(
      "http://localhost/api/trades",
      { marketId, side, amount },
      { authed: true }
    );
    const res = await tradesPOST(req as never);
    expect(res.status).toBe(400);
  });

  it("rejects 400 when txnHash is not 64-hex", async () => {
    const req = makeReq(
      "http://localhost/api/trades",
      { ...validBody, txnHash: "not-a-hash" },
      { authed: true }
    );
    const res = await tradesPOST(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when verifyTx says sender-mismatch", async () => {
    (verifyDesoTransfer as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      reason: "sender-mismatch" as const,
    });
    const req = makeReq(
      "http://localhost/api/trades",
      validBody,
      { authed: true }
    );
    const res = await tradesPOST(req as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe("sender-mismatch");
  });

  it("returns 400 when verifyTx says amount-too-low", async () => {
    (verifyDesoTransfer as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      reason: "amount-too-low" as const,
    });
    const req = makeReq(
      "http://localhost/api/trades",
      validBody,
      { authed: true }
    );
    const res = await tradesPOST(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when verifyTx says deso-api-unreachable (fail closed)", async () => {
    (verifyDesoTransfer as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      reason: "deso-api-unreachable" as const,
    });
    const req = makeReq(
      "http://localhost/api/trades",
      validBody,
      { authed: true }
    );
    const res = await tradesPOST(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 409 when DB raises 23505 unique_violation", async () => {
    (verifyDesoTransfer as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      actualAmountNanos: 211416490,
      blockHashHex: "abc123",
    });

    // P3-1.3: the 23505 now comes from the atomic_record_trade RPC, not from
    // a direct trades INSERT. Mock rpc to return the 23505 error.
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });

    const thenableInsert = {
      select: () => ({
        single: async () => ({ data: { id: "u1" }, error: null }),
      }),
      then: (fn: (v: { error: null }) => unknown) => fn({ error: null }),
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === "markets") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: "m1",
                  status: "open",
                  yes_price: 0.5,
                  no_price: 0.5,
                  yes_pool: 1000,
                  no_pool: 1000,
                  total_volume: 0,
                  category: "crypto",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: null }),
            maybeSingle: async () => ({ data: null, error: null }),
          }),
          maybeSingle: async () => ({ data: null, error: null }),
          then: (fn: (v: { data: unknown[]; error: null }) => unknown) =>
            fn({ data: [], error: null }),
        }),
        insert: () => thenableInsert,
      };
    });

    const req = makeReq(
      "http://localhost/api/trades",
      validBody,
      { authed: true }
    );
    const res = await tradesPOST(req as never);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.reason).toBe("replay");
  });
});

describe("POST /api/trades — P2-3.3 rate limiting", () => {
  // Re-import the mocked checkRateLimit so we can change its behavior
  // per-test without resetting the whole mock.
  const getMockedCheckRateLimit = async () => {
    const mod = await import("@/lib/rate-limit");
    return mod.checkRateLimit as ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockFrom.mockReset();
    process.env.DESO_PLATFORM_PUBLIC_KEY =
      "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7";
    const mocked = await getMockedCheckRateLimit();
    mocked.mockReset();
  });

  it("returns 429 when rate limit denies", async () => {
    const mocked = await getMockedCheckRateLimit();
    mocked.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });

    const validBody = {
      marketId: "m1",
      side: "yes",
      amount: 1,
      txnHash: "3459d59cc8efa4dc76c8802cc6b72510e7c90bf2af31da85edc8d8c2fdee6116",
    };
    const req = makeReq(
      "http://localhost/api/trades",
      validBody,
      { authed: true }
    );

    const res = await tradesPOST(req as never);
    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
  });

  it("proceeds past rate limit when allowed=true", async () => {
    const mocked = await getMockedCheckRateLimit();
    mocked.mockResolvedValue({
      allowed: true,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });

    // Everything downstream can fail; we just need to prove we got
    // past the 429 gate (status !== 429).
    const validBody = {
      marketId: "m1",
      side: "yes",
      amount: 1,
      txnHash: "3459d59cc8efa4dc76c8802cc6b72510e7c90bf2af31da85edc8d8c2fdee6116",
    };
    const req = makeReq(
      "http://localhost/api/trades",
      validBody,
      { authed: true }
    );

    const res = await tradesPOST(req as never);
    expect(res.status).not.toBe(429);
  });

  it("uses the correct bucketKey format trades:{publicKey}", async () => {
    const mocked = await getMockedCheckRateLimit();
    mocked.mockResolvedValue({
      allowed: true,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });

    const validBody = {
      marketId: "m1",
      side: "yes",
      amount: 1,
      txnHash: "3459d59cc8efa4dc76c8802cc6b72510e7c90bf2af31da85edc8d8c2fdee6116",
    };
    const req = makeReq(
      "http://localhost/api/trades",
      validBody,
      { authed: true }
    );

    await tradesPOST(req as never);

    expect(mocked).toHaveBeenCalledWith(
      expect.stringMatching(/^trades:BC1Y/),
      "trades"
    );
  });
});

describe("POST /api/trades/sell — P2-3.3 rate limiting", () => {
  const getMockedCheckRateLimit = async () => {
    const mod = await import("@/lib/rate-limit");
    return mod.checkRateLimit as ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockFrom.mockReset();
    const mocked = await getMockedCheckRateLimit();
    mocked.mockReset();
  });

  it("returns 429 when rate limit denies on sell route", async () => {
    const mocked = await getMockedCheckRateLimit();
    mocked.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });

    const req = makeReq(
      "http://localhost/api/trades/sell",
      { marketId: "m1", side: "yes", shares: 5 },
      { authed: true }
    );

    const res = await sellPOST(req as never);
    expect(res.status).toBe(429);
  });

  it("uses sell:{publicKey} bucket, separate from trades:", async () => {
    const mocked = await getMockedCheckRateLimit();
    mocked.mockResolvedValue({
      allowed: true,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });

    const req = makeReq(
      "http://localhost/api/trades/sell",
      { marketId: "m1", side: "yes", shares: 5 },
      { authed: true }
    );

    await sellPOST(req as never);

    expect(mocked).toHaveBeenCalledWith(
      expect.stringMatching(/^sell:BC1Y/),
      "trades"
    );
  });
});
