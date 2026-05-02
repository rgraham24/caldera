/**
 * PB-1 — atomicity tests for the buy trade route under v2 tokenomics.
 *
 * Verifies that:
 *   - The route calls atomic_record_trade_v2 with the expected JSONB shape
 *   - p_fees contains exactly 2 rows (platform + creator_auto_buy)
 *   - Error codes from the RPC map to HTTP statuses (23505 → 409, etc.)
 *   - BUY-6 amount cap (max 10_000) is enforced
 *   - Dead v1 paths (coin_holder_distributions) are gone
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AUTH_HEADER } from "@/lib/auth";

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}));

vi.mock("@/lib/deso/buyback", () => ({
  executeTokenBuyback: vi.fn().mockResolvedValue({ ok: false, reason: "test-mock" }),
  transferBoughtCoinsToCreator: vi.fn().mockResolvedValue(undefined),
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

const TEST_PK = "BC1YLgU3MCy5iBsKMHGrfdpZGGwJFEJhAXNmhCDMBFfDMBnCjc8hpNQ";
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

/** Wire mockFrom to pass through pre-RPC DB reads for a CLAIMED creator market. */
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
                title: "Test market",
                status: "open",
                yes_pool: 1000,
                no_pool: 1000,
                yes_price: 0.5,
                no_price: 0.5,
                total_volume: 500,
                category: "Music",
                creator_slug: "test-creator",
              },
              error: null,
            }),
          }),
        }),
      };
    }

    if (table === "creators") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "creator-1",
                claim_status: "claimed",
                deso_public_key: "BC1Y_PLATFORM_HELD",
                deso_username: "testcreator",
                claimed_deso_key: "BC1Y_USER_WALLET",
              },
              error: null,
            }),
          }),
        }),
      };
    }

    // Fire-and-forget analytics inserts return success.
    return {
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        }),
        maybeSingle: async () => ({ data: null, error: null }),
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
  process.env.DESO_PLATFORM_PUBLIC_KEY =
    "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7";
  delete process.env.DESO_PLATFORM_SEED;
});

describe("PB-1 — atomic_record_trade_v2 RPC wiring", () => {
  it("calls atomic_record_trade_v2 and returns 200 with trade id + quote", async () => {
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
      "atomic_record_trade_v2",
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

  it("RPC is called with NO escrow params (v1 had p_escrow_creator_id and p_escrow_amount)", async () => {
    setupDbMocks();
    mockRpc.mockResolvedValue({ data: "new-trade-uuid", error: null });
    await tradesPOST(makeReq(VALID_BODY) as never);

    const [[, callArgs]] = mockRpc.mock.calls;
    expect(callArgs).not.toHaveProperty("p_escrow_creator_id");
    expect(callArgs).not.toHaveProperty("p_escrow_amount");
  });

  it("p_fees contains exactly 2 rows: platform + creator_auto_buy", async () => {
    setupDbMocks();
    mockRpc.mockResolvedValue({ data: "new-trade-uuid", error: null });
    await tradesPOST(makeReq(VALID_BODY) as never);

    const [[, callArgs]] = mockRpc.mock.calls;
    const feeRows = callArgs.p_fees as Array<{ recipient_type: string; amount: number }>;
    expect(feeRows.length).toBe(2);

    const types = feeRows.map((r) => r.recipient_type).sort();
    expect(types).toEqual(["creator_auto_buy", "platform"]);

    // No legacy types should appear.
    expect(types).not.toContain("holder_rewards_pool");
    expect(types).not.toContain("auto_buy_pool");
    expect(types).not.toContain("creator");
    expect(types).not.toContain("creator_escrow");
    expect(types).not.toContain("market_creator");
  });

  it("p_fees rows reference the pre-generated trade id (source_id = p_trade.id)", async () => {
    setupDbMocks();
    mockRpc.mockResolvedValue({ data: "new-trade-uuid", error: null });
    await tradesPOST(makeReq(VALID_BODY) as never);

    const [[, callArgs]] = mockRpc.mock.calls;
    const tradeId: string = callArgs.p_trade.id;
    for (const row of callArgs.p_fees) {
      expect((row as { source_id: string }).source_id).toBe(tradeId);
      expect((row as { source_type: string }).source_type).toBe("trade");
    }
  });

  it("creator_auto_buy fee row carries creator_id as recipient_id", async () => {
    setupDbMocks();
    mockRpc.mockResolvedValue({ data: "new-trade-uuid", error: null });
    await tradesPOST(makeReq(VALID_BODY) as never);

    const [[, callArgs]] = mockRpc.mock.calls;
    const autoBuy = callArgs.p_fees.find(
      (r: { recipient_type: string }) => r.recipient_type === "creator_auto_buy"
    );
    expect(autoBuy.recipient_id).toBe("creator-1");
  });

  it("p_trade does NOT include coin_holder_pool_amount (dead v1 field)", async () => {
    setupDbMocks();
    mockRpc.mockResolvedValue({ data: "new-trade-uuid", error: null });
    await tradesPOST(makeReq(VALID_BODY) as never);

    const [[, callArgs]] = mockRpc.mock.calls;
    expect(Object.keys(callArgs.p_trade)).not.toContain("coin_holder_pool_amount");
  });
});

describe("PB-1 — RPC error mapping", () => {
  it("23505 unique_violation → 409 with reason:replay", async () => {
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

  it("market-not-found exception from RPC → 404", async () => {
    setupDbMocks();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "market-not-found: market-uuid-1" },
    });

    const res = await tradesPOST(makeReq(VALID_BODY) as never);
    expect(res.status).toBe(404);
  });

  it("generic RPC error → 500 with reason", async () => {
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

describe("PB-1 — BUY-6 amount cap", () => {
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
    expect(res.status).not.toBe(400);
  });

  it("rejects amount === 0 with 400 (positive enforcement)", async () => {
    const req = makeReq({ ...VALID_BODY, amount: 0 });
    const res = await tradesPOST(req as never);
    expect(res.status).toBe(400);
  });
});

describe("PB-1 — v2 creator-required gate", () => {
  it("rejects markets without creator_slug (legacy crypto markets)", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { id: "u1" }, error: null }) }) }),
          insert: () => ({ select: () => ({ single: async () => ({ data: { id: "u1" }, error: null }) }) }),
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
                  yes_pool: 1000, no_pool: 1000, yes_price: 0.5, no_price: 0.5, total_volume: 0,
                  category: "Crypto",
                  creator_slug: null,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
    });

    const res = await tradesPOST(makeReq(VALID_BODY) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("creator");
  });
});

describe("PB-1 — dead v1 code paths removed", () => {
  it("never calls from(coin_holder_distributions) under any execution path", async () => {
    setupDbMocks();
    mockRpc.mockResolvedValue({ data: "new-trade-uuid", error: null });
    await tradesPOST(makeReq(VALID_BODY) as never);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calledTables = mockFrom.mock.calls.map((args: any[]) => args[0] as string);
    expect(calledTables).not.toContain("coin_holder_distributions");
  });

  it("never calls from(holder_rewards) (table archived in PB-3)", async () => {
    setupDbMocks();
    mockRpc.mockResolvedValue({ data: "new-trade-uuid", error: null });
    await tradesPOST(makeReq(VALID_BODY) as never);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calledTables = mockFrom.mock.calls.map((args: any[]) => args[0] as string);
    expect(calledTables).not.toContain("holder_rewards");
  });

  it("never reads platform_config (rates are now hardcoded constants)", async () => {
    setupDbMocks();
    mockRpc.mockResolvedValue({ data: "new-trade-uuid", error: null });
    await tradesPOST(makeReq(VALID_BODY) as never);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calledTables = mockFrom.mock.calls.map((args: any[]) => args[0] as string);
    expect(calledTables).not.toContain("platform_config");
  });
});
