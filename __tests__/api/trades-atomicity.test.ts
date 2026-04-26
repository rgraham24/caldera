/**
 * P3-1.3 — atomicity tests for the buy trade route.
 *
 * Verifies that:
 * - The route calls atomic_record_trade with the expected JSONB shape
 * - Error codes from the RPC are correctly mapped to HTTP statuses
 * - BUY-6 amount cap (max 10_000) is enforced
 * - Fire-and-forget calls only execute AFTER the RPC commits
 * - Dead v1 paths (coin_holder_distributions) are gone
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AUTH_HEADER } from "@/lib/auth";

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}));

vi.mock("@/lib/fees/relevantToken", () => ({
  resolveRelevantToken: vi.fn().mockResolvedValue({
    slug: "bitcoin",
    deso_public_key: "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7",
  }),
}));

vi.mock("@/lib/fees/holderSnapshot", () => ({
  snapshotHolders: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/deso/buyback", () => ({
  executeTokenBuyback: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/deso/rate", () => ({
  fetchDesoUsdRate: vi.fn().mockResolvedValue(10),
  usdToDesoNanos: vi.fn().mockReturnValue(BigInt(200_000_000)),
}));

vi.mock("@/lib/deso/verifyTx", () => ({
  verifyDesoTransfer: vi.fn().mockResolvedValue({
    ok: true,
    actualAmountNanos: 200_000_000,
    blockHashHex: "abc123",
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: Date.now() + 60_000,
  }),
}));

import { POST as tradesPOST } from "@/app/api/trades/route";
import { snapshotHolders } from "@/lib/fees/holderSnapshot";

const TEST_PK = "BC1YLgU3MCy5iBsKMHGrfdpZGGwJFEJhAXNmhCDMBFfDMBnCjc8hpNQ";
// Valid DeSo tx hash: exactly 64 lowercase hex chars
const VALID_TX_HASH = "a".repeat(64);

const VALID_BODY = {
  marketId: "market-uuid-1",
  side: "yes" as const,
  amount: 100,
  txnHash: VALID_TX_HASH,
};

function makeReq(body: unknown, authed = true): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (authed) headers[AUTH_HEADER] = TEST_PK;
  return new Request("http://localhost/api/trades", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** Wire up mockFrom to pass through all pre-RPC DB reads. */
function setupDbMocks() {
  mockFrom.mockImplementation((table: string) => {
    if (table === "users") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: "u1" }, error: null }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({ data: { id: "u1" }, error: null }),
          }),
        }),
      };
    }

    if (table === "markets") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                id: "market-uuid-1",
                status: "open",
                yes_pool: 1000,
                no_pool: 1000,
                yes_price: 0.5,
                no_price: 0.5,
                total_volume: 500,
                category: "crypto",
                creator_slug: null,
              },
              error: null,
            }),
          }),
        }),
      };
    }

    if (table === "platform_config") {
      return {
        select: () => ({
          then: (fn: (v: { data: unknown[]; error: null }) => unknown) =>
            Promise.resolve(fn({ data: [], error: null })),
        }),
      };
    }

    // creators + any fire-and-forget analytics tables
    return {
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        }),
        maybeSingle: async () => ({ data: null, error: null }),
        then: (fn: (v: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve(fn({ data: [], error: null })),
      }),
      insert: () => ({
        then: (fn: (v: { error: null }) => unknown) =>
          Promise.resolve(fn({ error: null })),
      }),
    };
  });
}

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
  vi.mocked(snapshotHolders).mockReset();
  process.env.DESO_PLATFORM_PUBLIC_KEY =
    "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7";
  delete process.env.DESO_PLATFORM_SEED;
});

describe("P3-1.3 — atomic_record_trade RPC wiring", () => {
  it("calls atomic_record_trade and returns 200 with trade id + quote", async () => {
    setupDbMocks();
    mockRpc.mockResolvedValue({ data: "new-trade-uuid", error: null });

    const res = await tradesPOST(makeReq(VALID_BODY) as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.trade.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(body.data.quote.sharesReceived).toBeTypeOf("number");
    expect(body.data.fees).toBeDefined();

    expect(mockRpc).toHaveBeenCalledWith(
      "atomic_record_trade",
      expect.objectContaining({
        p_trade: expect.objectContaining({
          user_id: "u1",
          market_id: "market-uuid-1",
          side: "yes",
          action_type: "buy",
          tx_hash: VALID_TX_HASH,
        }),
        p_market: expect.objectContaining({
          id: "market-uuid-1",
          volume_delta: 100,
        }),
        p_position_delta: expect.objectContaining({
          user_id: "u1",
          market_id: "market-uuid-1",
          side: "yes",
        }),
        p_fees: expect.any(Array),
      })
    );
  });

  it("p_trade does NOT include coin_holder_pool_amount (dead v1 field)", async () => {
    setupDbMocks();
    mockRpc.mockResolvedValue({ data: "new-trade-uuid", error: null });

    await tradesPOST(makeReq(VALID_BODY) as never);

    const [[, callArgs]] = mockRpc.mock.calls;
    expect(Object.keys(callArgs.p_trade)).not.toContain("coin_holder_pool_amount");
  });

  it("fee rows reference the pre-generated trade id (source_id = p_trade.id)", async () => {
    setupDbMocks();
    mockRpc.mockResolvedValue({ data: "new-trade-uuid", error: null });

    await tradesPOST(makeReq(VALID_BODY) as never);

    const [[, callArgs]] = mockRpc.mock.calls;
    const tradeId: string = callArgs.p_trade.id;
    expect(typeof tradeId).toBe("string");

    if (callArgs.p_fees.length > 0) {
      for (const row of callArgs.p_fees) {
        expect((row as { source_id: string }).source_id).toBe(tradeId);
        expect((row as { source_type: string }).source_type).toBe("trade");
      }
    }
  });
});

describe("P3-1.3 — RPC error mapping", () => {
  it("maps 23505 unique_violation from RPC → 409 with reason:replay", async () => {
    setupDbMocks();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });

    const res = await tradesPOST(makeReq(VALID_BODY) as never);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.reason).toBe("replay");
  });

  it("maps market-not-found exception from RPC → 404", async () => {
    setupDbMocks();
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "market-not-found: market-uuid-1",
      },
    });

    const res = await tradesPOST(makeReq(VALID_BODY) as never);

    expect(res.status).toBe(404);
  });

  it("maps generic RPC error → 500 with reason", async () => {
    setupDbMocks();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "unexpected internal error" },
    });

    const res = await tradesPOST(makeReq(VALID_BODY) as never);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.reason).toContain("unexpected internal error");
  });
});

describe("P3-1.3 — BUY-6 amount cap", () => {
  it("rejects amount > 10_000 with 400", async () => {
    const req = makeReq({ ...VALID_BODY, amount: 10_001 });
    const res = await tradesPOST(req as never);
    expect(res.status).toBe(400);
  });

  it("accepts amount === 10_000 (boundary)", async () => {
    setupDbMocks();
    mockRpc.mockResolvedValue({ data: "new-trade-uuid", error: null });

    const req = makeReq({ ...VALID_BODY, amount: 10_000 });
    const res = await tradesPOST(req as never);
    // Anything that passed the Zod schema (not 400) is acceptable
    expect(res.status).not.toBe(400);
  });

  it("rejects amount of 0 with 400 (positive() still enforced)", async () => {
    const req = makeReq({ ...VALID_BODY, amount: 0 });
    const res = await tradesPOST(req as never);
    expect(res.status).toBe(400);
  });
});

describe("P3-1.3 — fire-and-forget ordering", () => {
  it("does NOT call snapshotHolders when the RPC fails", async () => {
    setupDbMocks();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "rpc failure" },
    });

    await tradesPOST(makeReq(VALID_BODY) as never);

    expect(snapshotHolders).not.toHaveBeenCalled();
  });

  it("calls snapshotHolders after RPC success when relevantToken has deso_public_key", async () => {
    setupDbMocks();
    mockRpc.mockResolvedValue({ data: "new-trade-uuid", error: null });

    await tradesPOST(makeReq(VALID_BODY) as never);

    // relevantToken mock returns { slug: 'bitcoin', deso_public_key: '...' }
    // and holderRewards > 0, so snapshotHolders should be called
    expect(snapshotHolders).toHaveBeenCalled();
    const [[snapshotArgs]] = vi.mocked(snapshotHolders).mock.calls;
    expect(snapshotArgs.market_id).toBe("market-uuid-1");
    expect(snapshotArgs.totalAmountUsd).toBeTypeOf("number");
  });
});

describe("P3-1.3 — dead v1 code paths removed", () => {
  it("never calls from(coin_holder_distributions) under any execution path", async () => {
    setupDbMocks();
    mockRpc.mockResolvedValue({ data: "new-trade-uuid", error: null });

    await tradesPOST(makeReq(VALID_BODY) as never);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
const calledTables = mockFrom.mock.calls.map((args: any[]) => args[0] as string);
    expect(calledTables).not.toContain("coin_holder_distributions");
  });

  it("never calls from(coin_holder_distributions) even when RPC fails", async () => {
    setupDbMocks();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "rpc failure" },
    });

    await tradesPOST(makeReq(VALID_BODY) as never);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
const calledTables = mockFrom.mock.calls.map((args: any[]) => args[0] as string);
    expect(calledTables).not.toContain("coin_holder_distributions");
  });
});
