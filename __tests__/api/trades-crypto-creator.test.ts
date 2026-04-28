/**
 * Stream 1.3a-2 — regression test: crypto-market creator routing.
 *
 * Bug: trade route looked up creator row by market.creator_slug without
 * guarding against crypto markets. A BTC market with creator_slug='bitcoin'
 * caused calculateBuyFees to receive creator={claim_status:'unclaimed'},
 * routing the 0.5% creator slice to creator_escrow instead of folding it
 * into holder_rewards.
 *
 * Fix: app/api/trades/route.ts — guard `if (market.creator_slug && !mktFields.crypto_ticker)`
 *
 * These tests verify the correct fee shape for a crypto market trade even
 * when the creators table contains a matching row for the coin slug.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AUTH_HEADER } from "@/lib/auth";

// ─── Module mocks (mirror trades-atomicity.test.ts exactly) ──────────────────

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}));

vi.mock("@/lib/fees/relevantToken", () => ({
  resolveRelevantToken: vi.fn().mockResolvedValue({
    type: "crypto",
    slug: "bitcoin",
    deso_public_key: "BC1YLht6kTvCHS5gSzysSkjLTbVwq7D6DAEVzgBCTH58a7taQTwf3XN",
    display_label: "$Bitcoin",
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
  usdToDesoNanos: vi.fn().mockReturnValue(BigInt(100_000_000)),
}));

vi.mock("@/lib/deso/verifyTx", () => ({
  verifyDesoTransfer: vi.fn().mockResolvedValue({
    ok: true,
    actualAmountNanos: 100_000_000,
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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TEST_PK = "BC1YLgU3MCy5iBsKMHGrfdpZGGwJFEJhAXNmhCDMBFfDMBnCjc8hpNQ";
const VALID_TX_HASH = "b".repeat(64);

const VALID_BODY = {
  marketId: "market-btc-1",
  side: "yes" as const,
  amount: 1,
  txnHash: VALID_TX_HASH,
};

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/trades", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [AUTH_HEADER]: TEST_PK,
    },
    body: JSON.stringify(body),
  });
}

/**
 * Wire up mockFrom for a BTC crypto market.
 *
 * Key: the creators table mock returns a real unclaimed bitcoin creator row.
 * This simulates the production state that triggered the bug — the creators
 * table HAS a row for slug='bitcoin', but the route must NOT use it for
 * fee routing on a crypto market.
 */
function setupCryptoBtcMarketMocks() {
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
                id: "market-btc-1",
                status: "open",
                yes_pool: 1000,
                no_pool: 1000,
                yes_price: 0.5,
                no_price: 0.5,
                total_volume: 0,
                category: "Crypto",
                // crypto market shape — this is the critical combination:
                crypto_ticker: "BTC",
                creator_slug: "bitcoin",
                creator_id: null,
                category_token_slug: null,
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

    if (table === "creators") {
      // Simulate production: the bitcoin creator row EXISTS in the DB.
      // The route must NOT use this row for fee routing on a crypto market.
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "34d6cca5-bf07-41ac-a0d8-6e1d9bfa010f",
                token_status: "active_unverified",
                claim_status: "unclaimed",
                deso_public_key: "BC1YLht6kTvCHS5gSzysSkjLTbVwq7D6DAEVzgBCTH58a7taQTwf3XN",
                deso_username: "bitcoin",
              },
              error: null,
            }),
          }),
        }),
      };
    }

    // Fallback for any other tables
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

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
  process.env.DESO_PLATFORM_PUBLIC_KEY =
    "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7";
  delete process.env.DESO_PLATFORM_SEED;
});

describe("POST /api/trades — crypto market creator routing (regression 1.3a)", () => {
  it("does not route 0.5% creator slice to escrow on crypto markets", async () => {
    setupCryptoBtcMarketMocks();
    mockRpc.mockResolvedValue({ data: "new-trade-uuid", error: null });

    const res = await tradesPOST(makeReq(VALID_BODY) as never);
    expect(res.status).toBe(200);

    const [[, callArgs]] = mockRpc.mock.calls;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fees: any[] = callArgs.p_fees;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const escrowRow = fees.find((f: any) => f.recipient_type === "creator_escrow");
    expect(escrowRow).toBeUndefined();
  });

  it("folds creator slice into holder_rewards_pool on crypto markets (1.0% not 0.5%)", async () => {
    setupCryptoBtcMarketMocks();
    mockRpc.mockResolvedValue({ data: "new-trade-uuid", error: null });

    await tradesPOST(makeReq(VALID_BODY) as never);

    const [[, callArgs]] = mockRpc.mock.calls;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fees: any[] = callArgs.p_fees;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const holderRow = fees.find((f: any) => f.recipient_type === "holder_rewards_pool");
    expect(holderRow).toBeDefined();
    // Creator slice (0.5%) folds into holder rewards → 1.0% of $1 = $0.01
    expect(Number(holderRow.amount)).toBeCloseTo(0.01, 5);
  });

  it("preserves platform 1% on crypto markets", async () => {
    setupCryptoBtcMarketMocks();
    mockRpc.mockResolvedValue({ data: "new-trade-uuid", error: null });

    await tradesPOST(makeReq(VALID_BODY) as never);

    const [[, callArgs]] = mockRpc.mock.calls;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fees: any[] = callArgs.p_fees;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const platformRow = fees.find((f: any) => f.recipient_type === "platform");
    expect(platformRow).toBeDefined();
    expect(Number(platformRow.amount)).toBeCloseTo(0.01, 5);
  });

  it("preserves auto_buy 0.5% on crypto markets", async () => {
    setupCryptoBtcMarketMocks();
    mockRpc.mockResolvedValue({ data: "new-trade-uuid", error: null });

    await tradesPOST(makeReq(VALID_BODY) as never);

    const [[, callArgs]] = mockRpc.mock.calls;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fees: any[] = callArgs.p_fees;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const autoBuyRow = fees.find((f: any) => f.recipient_type === "auto_buy_pool");
    expect(autoBuyRow).toBeDefined();
    expect(Number(autoBuyRow.amount)).toBeCloseTo(0.005, 5);
  });
});
