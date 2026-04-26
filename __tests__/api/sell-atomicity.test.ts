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

// Supabase chainable mock
const userSingleMock = vi.fn();
const marketSingleMock = vi.fn();
const positionSingleMock = vi.fn();
const tradeInsertSingleMock = vi.fn();
const tradeUpdateMock = vi.fn();
const rpcMock = vi.fn();

const fromMock = vi.fn((table: string) => {
  if (table === "users") {
    return {
      select: () => ({
        eq: () => ({ maybeSingle: userSingleMock }),
      }),
    };
  }
  if (table === "markets") {
    return {
      select: () => ({
        eq: () => ({ maybeSingle: marketSingleMock }),
      }),
    };
  }
  if (table === "positions") {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              neq: () => ({ maybeSingle: positionSingleMock }),
            }),
          }),
        }),
      }),
    };
  }
  if (table === "trades") {
    return {
      insert: () => ({
        select: () => ({ single: tradeInsertSingleMock }),
      }),
      update: () => ({ eq: tradeUpdateMock }),
    };
  }
  throw new Error(`unexpected table: ${table}`);
});

const serviceClientMock = { from: fromMock, rpc: rpcMock };

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => serviceClientMock),
}));

// Mock global fetch for price API
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { POST } from "@/app/api/trades/sell/route";
import { getAuthenticatedUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { transferDeso } from "@/lib/deso/transferDeso";
import { checkDesoSolvency } from "@/lib/deso/solvency";

const PUBKEY = "BC1YLhriEzhGkrKzUGmL3B4Zdq9S63oGVSYMhUV1UT5vDoRieHceZBB";
const USER_ID = "11111111-1111-1111-1111-111111111111";
// Zod v4 requires proper UUID version/variant bits:
// 3rd segment must start with [1-8], 4th segment must start with [89ab]
const MARKET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const POSITION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const IDEMPOTENCY_KEY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const mockedAuth = getAuthenticatedUser as ReturnType<typeof vi.fn>;
const mockedRL = checkRateLimit as ReturnType<typeof vi.fn>;
const mockedTransfer = transferDeso as ReturnType<typeof vi.fn>;
const mockedSolvency = checkDesoSolvency as ReturnType<typeof vi.fn>;

function makeReq(body: Record<string, unknown>) {
  return new Request("http://localhost/api/trades/sell", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = () => ({
  marketId: MARKET_ID,
  side: "yes",
  shares: 10,
  idempotencyKey: IDEMPOTENCY_KEY,
});

function openMarket() {
  return {
    id: MARKET_ID,
    status: "open",
    yes_price: 0.5,
    no_price: 0.5,
    yes_pool: 1000,
    no_pool: 1000,
    total_volume: 100,
  };
}

function openPosition(quantity: number = 100) {
  return {
    id: POSITION_ID,
    quantity,
    total_cost: 50,
    fees_paid: 1.25,
    avg_entry_price: 0.5,
    realized_pnl: 0,
    status: "open",
  };
}

beforeEach(() => {
  mockedAuth.mockReset().mockReturnValue({ publicKey: PUBKEY });
  mockedRL.mockReset().mockResolvedValue({
    allowed: true, remaining: 9, resetAt: Date.now() + 60_000,
  });
  mockedTransfer.mockReset();
  mockedSolvency.mockReset();
  fromMock.mockClear();
  rpcMock.mockReset();
  userSingleMock.mockReset().mockResolvedValue({
    data: { id: USER_ID }, error: null,
  });
  marketSingleMock.mockReset().mockResolvedValue({
    data: openMarket(), error: null,
  });
  positionSingleMock.mockReset().mockResolvedValue({
    data: openPosition(), error: null,
  });
  tradeInsertSingleMock.mockReset();
  tradeUpdateMock.mockReset().mockResolvedValue({ data: null, error: null });

  fetchMock.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({ USDCentsPerDeSoExchangeRate: 500 }), // $5/DESO
  });

  process.env.DESO_PLATFORM_PUBLIC_KEY = "BC1YLPLATFORM";
  process.env.DESO_PLATFORM_SEED = "deadbeef".repeat(16);
});

describe("POST /api/trades/sell — atomic sell flow", () => {
  it("Gate 1: malformed body → 400 bad-body", async () => {
    const res = await POST(makeReq({}) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("bad-body");
  });

  it("Gate 1: missing idempotencyKey → 400 bad-body", async () => {
    const res = await POST(makeReq({
      marketId: MARKET_ID, side: "yes", shares: 10,
    }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("bad-body");
  });

  it("Gate 2: unauthenticated → 401", async () => {
    mockedAuth.mockReturnValue(null);
    const res = await POST(makeReq(validBody()) as never);
    expect(res.status).toBe(401);
  });

  it("Gate 3: rate limit denies → 429", async () => {
    mockedRL.mockResolvedValue({
      allowed: false, remaining: 0, resetAt: Date.now() + 30_000,
    });
    const res = await POST(makeReq(validBody()) as never);
    expect(res.status).toBe(429);
  });

  it("Platform env missing → 503 platform-wallet-unavailable", async () => {
    delete process.env.DESO_PLATFORM_PUBLIC_KEY;
    const res = await POST(makeReq(validBody()) as never);
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe("platform-wallet-unavailable");
  });

  it("Gate 4: user not found → 404 user-not-found", async () => {
    userSingleMock.mockResolvedValue({ data: null, error: null });
    const res = await POST(makeReq(validBody()) as never);
    expect(res.status).toBe(404);
    expect((await res.json()).reason).toBe("user-not-found");
  });

  it("Gate 5: market not found → 404 market-not-found", async () => {
    marketSingleMock.mockResolvedValue({ data: null, error: null });
    const res = await POST(makeReq(validBody()) as never);
    expect(res.status).toBe(404);
    expect((await res.json()).reason).toBe("market-not-found");
  });

  it("Gate 5: market closed → 400 market-closed", async () => {
    marketSingleMock.mockResolvedValue({
      data: { ...openMarket(), status: "resolved" }, error: null,
    });
    const res = await POST(makeReq(validBody()) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("market-closed");
  });

  it("Gate 6: no position → 404 no-position", async () => {
    positionSingleMock.mockResolvedValue({ data: null, error: null });
    const res = await POST(makeReq(validBody()) as never);
    expect(res.status).toBe(404);
    expect((await res.json()).reason).toBe("no-position");
  });

  it("Gate 6: not enough shares → 400 not-enough-shares", async () => {
    positionSingleMock.mockResolvedValue({
      data: openPosition(5), error: null, // only owns 5; trying to sell 10
    });
    const res = await POST(makeReq(validBody()) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("not-enough-shares");
  });

  it("Gate 8: price fetch fails → 503 price-fetch-failed", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    const res = await POST(makeReq(validBody()) as never);
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe("price-fetch-failed");
  });

  it("Gate 8: amount too small → 400 amount-too-small", async () => {
    // Tiny return: shares=0.000001, currentPrice=0.5 → returnAmount=0.0000005
    // At $5/DESO, that's 0.000_000_1 DESO = 100 nanos. Below 1000-nano floor.
    positionSingleMock.mockResolvedValue({
      data: openPosition(0.001), error: null,
    });
    const tiny = { ...validBody(), shares: 0.000001 };
    const res = await POST(makeReq(tiny) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("amount-too-small");
  });

  it("Gate 9: platform insolvent → 503 platform-insufficient-funds", async () => {
    mockedSolvency.mockResolvedValue({
      ok: false, reason: "insufficient",
      required: BigInt(2_000_000), available: BigInt(1_000_000),
    });
    const res = await POST(makeReq(validBody()) as never);
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe("platform-insufficient-funds");
  });

  it("Gate 10: 23505 unique violation → 409 sell-in-progress", async () => {
    mockedSolvency.mockResolvedValue({ ok: true, available: BigInt(9e9) });
    tradeInsertSingleMock.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    const res = await POST(makeReq(validBody()) as never);
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe("sell-in-progress");
  });

  it("Gate 11: transfer fails → 500 transfer-failed + audit row marked failed", async () => {
    mockedSolvency.mockResolvedValue({ ok: true, available: BigInt(9e9) });
    tradeInsertSingleMock.mockResolvedValue({
      data: { id: IDEMPOTENCY_KEY }, error: null,
    });
    mockedTransfer.mockResolvedValue({
      ok: false, reason: "submit-failed", detail: "DeSo rejected",
    });
    const res = await POST(makeReq(validBody()) as never);
    expect(res.status).toBe(500);
    expect((await res.json()).reason).toBe("transfer-failed");
    expect(tradeUpdateMock).toHaveBeenCalled();
  });

  it("Gate 12: post-send RPC failure → 500 ledger-update-failed", async () => {
    mockedSolvency.mockResolvedValue({ ok: true, available: BigInt(9e9) });
    tradeInsertSingleMock.mockResolvedValue({
      data: { id: IDEMPOTENCY_KEY }, error: null,
    });
    mockedTransfer.mockResolvedValue({
      ok: true, txHashHex: "deadbeef", feeNanos: BigInt(168),
    });
    rpcMock.mockResolvedValue({
      data: null, error: { message: "trade-not-pending: ..." },
    });
    const res = await POST(makeReq(validBody()) as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.reason).toBe("ledger-update-failed");
    expect(body.txHashHex).toBe("deadbeef");
  });

  it("Happy path partial sell: 200 + RPC called with close=false", async () => {
    mockedSolvency.mockResolvedValue({ ok: true, available: BigInt(9e9) });
    tradeInsertSingleMock.mockResolvedValue({
      data: { id: IDEMPOTENCY_KEY }, error: null,
    });
    mockedTransfer.mockResolvedValue({
      ok: true, txHashHex: "deadbeef", feeNanos: BigInt(168),
    });
    rpcMock.mockResolvedValue({ data: null, error: null });

    const res = await POST(makeReq(validBody()) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.tradeId).toBe(IDEMPOTENCY_KEY);
    expect(body.payoutTxHashHex).toBe("deadbeef");
    expect(body.sharesSold).toBe(10);
    expect(body.newQuantity).toBe(90); // 100 - 10

    // RPC should be called with close=false (selling 10 of 100)
    const rpcCall = rpcMock.mock.calls[0];
    expect(rpcCall[0]).toBe("mark_sell_complete");
    expect(rpcCall[1].p_position_delta.close).toBe(false);
    expect(rpcCall[1].p_position_delta.qty_to_remove).toBe(10);
  });

  it("Happy path close: selling all shares → RPC called with close=true", async () => {
    positionSingleMock.mockResolvedValue({
      data: openPosition(10), error: null, // owns 10, selling 10
    });
    mockedSolvency.mockResolvedValue({ ok: true, available: BigInt(9e9) });
    tradeInsertSingleMock.mockResolvedValue({
      data: { id: IDEMPOTENCY_KEY }, error: null,
    });
    mockedTransfer.mockResolvedValue({
      ok: true, txHashHex: "deadbeef", feeNanos: BigInt(168),
    });
    rpcMock.mockResolvedValue({ data: null, error: null });

    const res = await POST(makeReq(validBody()) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.newQuantity).toBe(0);

    const rpcCall = rpcMock.mock.calls[0];
    expect(rpcCall[1].p_position_delta.close).toBe(true);
  });
});
