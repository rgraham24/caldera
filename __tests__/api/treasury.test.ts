/**
 * __tests__/api/treasury.test.ts
 *
 * Integration tests for GET /api/admin/treasury.
 * 4 tests per Stream 2 Phase 1 design doc.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ─── Module mocks (must be before imports) ────────────────────────────────────

vi.mock("@/lib/admin/auth", () => ({
  isAdminAuthorized: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/finance/liability", () => ({
  computePlatformLiability: vi.fn(),
}));

import { GET } from "@/app/api/admin/treasury/route";
import { isAdminAuthorized } from "@/lib/admin/auth";
import { computePlatformLiability } from "@/lib/finance/liability";

const mockedAuth = isAdminAuthorized as Mock;
const mockedCompute = computePlatformLiability as Mock;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_SNAPSHOT = {
  asOf: "2026-04-28T20:00:00.000Z",
  desoUsdRate: 5.0,
  walletBalances: {
    deso_nanos: BigInt(10_000_000_000),
    creatorCoins: { bitcoin: BigInt(2_000_000_000) },
  },
  liability: {
    deso_nanos: BigInt(5_000_000_000),
    deso_breakdown: {
      open_position_worst_case_nanos: BigInt(4_000_000_000),
      pending_position_payouts_nanos: BigInt(1_000_000_000),
      creator_escrow_nanos: BigInt(0),
    },
    creatorCoins: {
      bitcoin: {
        nanos: BigInt(100_000_000),
        breakdown: {
          pending_holder_rewards_usd: 1.0,
          pending_holder_rewards_rows: 5,
          current_coin_price_usd: 10.0,
        },
      },
    },
  },
  extractable: {
    deso_nanos: BigInt(4_500_000_000),
    creatorCoins: { bitcoin: BigInt(1_900_000_000) },
  },
  status: { deso: "healthy", creatorCoins: { bitcoin: "healthy" } },
  warnings: [],
};

function makeReq(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/admin/treasury", {
    method: "GET",
    headers,
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockedAuth.mockReset();
  mockedCompute.mockReset();
  process.env.DESO_PLATFORM_PUBLIC_KEY =
    "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7";
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/admin/treasury", () => {
  // 1 — No auth header → 401
  it("returns 401 when no Authorization header is provided", async () => {
    mockedAuth.mockReturnValue(false);

    const res = await GET(makeReq() as never);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  // 2 — Wrong password → 401
  it("returns 401 when wrong password is provided", async () => {
    mockedAuth.mockReturnValue(false);

    const res = await GET(
      makeReq({ authorization: "Bearer wrong-password" }) as never
    );
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  // 3 — Valid auth → 200 + snapshot shape
  it("returns 200 with TreasurySnapshot on valid auth", async () => {
    mockedAuth.mockReturnValue(true);
    mockedCompute.mockResolvedValue(SAMPLE_SNAPSHOT);

    const res = await GET(
      makeReq({ authorization: "Bearer caldera-admin-2026" }) as never
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    // All required top-level fields present
    const snap = body.snapshot;
    expect(snap).toHaveProperty("asOf");
    expect(snap).toHaveProperty("desoUsdRate");
    expect(snap).toHaveProperty("walletBalances");
    expect(snap).toHaveProperty("liability");
    expect(snap).toHaveProperty("extractable");
    expect(snap).toHaveProperty("status");
    expect(snap).toHaveProperty("warnings");

    // Nested shape
    expect(snap.walletBalances).toHaveProperty("deso_nanos");
    expect(snap.walletBalances).toHaveProperty("creatorCoins");
    expect(snap.liability).toHaveProperty("deso_nanos");
    expect(snap.liability).toHaveProperty("deso_breakdown");
    expect(snap.liability.deso_breakdown).toHaveProperty(
      "open_position_worst_case_nanos"
    );
    expect(snap.liability.deso_breakdown).toHaveProperty(
      "pending_position_payouts_nanos"
    );
    expect(snap.liability.deso_breakdown).toHaveProperty(
      "creator_escrow_nanos"
    );
    expect(snap.extractable).toHaveProperty("deso_nanos");
    expect(snap.status).toHaveProperty("deso");
  });

  // 4 — Bigint serialization → strings in response
  it("serializes all bigint fields as decimal strings", async () => {
    mockedAuth.mockReturnValue(true);
    mockedCompute.mockResolvedValue(SAMPLE_SNAPSHOT);

    const res = await GET(
      makeReq({ authorization: "Bearer caldera-admin-2026" }) as never
    );
    const body = await res.json();
    const snap = body.snapshot;

    // Top-level bigints → strings
    expect(typeof snap.walletBalances.deso_nanos).toBe("string");
    expect(snap.walletBalances.deso_nanos).toBe("10000000000");

    expect(typeof snap.liability.deso_nanos).toBe("string");
    expect(snap.liability.deso_nanos).toBe("5000000000");

    expect(typeof snap.extractable.deso_nanos).toBe("string");
    expect(snap.extractable.deso_nanos).toBe("4500000000");

    // Nested bigints → strings
    expect(typeof snap.walletBalances.creatorCoins.bitcoin).toBe("string");
    expect(snap.walletBalances.creatorCoins.bitcoin).toBe("2000000000");

    expect(typeof snap.liability.creatorCoins.bitcoin.nanos).toBe("string");
    expect(snap.liability.creatorCoins.bitcoin.nanos).toBe("100000000");

    expect(typeof snap.liability.deso_breakdown.open_position_worst_case_nanos).toBe("string");
    expect(snap.liability.deso_breakdown.creator_escrow_nanos).toBe("0");

    expect(typeof snap.extractable.creatorCoins.bitcoin).toBe("string");
    expect(snap.extractable.creatorCoins.bitcoin).toBe("1900000000");

    // Non-bigint fields unmolested
    expect(snap.desoUsdRate).toBe(5.0);
    expect(snap.status.deso).toBe("healthy");
    expect(Array.isArray(snap.warnings)).toBe(true);
  });
});
