import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth + rate-limit BEFORE importing the route
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

// Supabase mock — chainable .from().select().eq().returns()
const viewSelectMock = vi.fn();
const creatorsSelectMock = vi.fn();
// The route awaits the result of the last chain call directly:
//   view: await supabase.from(...).select(...).eq(...)
//   creators: await supabase.from(...).select(...).in(...)
// So .eq and .in ARE the terminal mocks — they return Promises.
const fromMock = vi.fn((table: string) => {
  if (table === "v_holder_rewards_pending_by_user") {
    return {
      select: () => ({
        eq: viewSelectMock,
      }),
    };
  }
  if (table === "creators") {
    return {
      select: () => ({
        in: creatorsSelectMock,
      }),
    };
  }
  throw new Error(`unexpected table: ${table}`);
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({ from: fromMock })),
}));

import { GET } from "@/app/api/holder-rewards/balance/route";
import { getAuthenticatedUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

const PUBKEY = "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7";

const mockedAuth = getAuthenticatedUser as ReturnType<typeof vi.fn>;
const mockedRL = checkRateLimit as ReturnType<typeof vi.fn>;

function makeReq() {
  return new Request("http://localhost/api/holder-rewards/balance", {
    method: "GET",
  });
}

beforeEach(() => {
  mockedAuth.mockReset();
  mockedRL.mockReset();
  mockedRL.mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: Date.now() + 60_000,
  });
  viewSelectMock.mockReset();
  creatorsSelectMock.mockReset();
});

describe("GET /api/holder-rewards/balance", () => {
  it("returns 401 when not authenticated", async () => {
    mockedAuth.mockReturnValue(null);
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limit denies", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedRL.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });

    const res = await GET(makeReq() as never);
    expect(res.status).toBe(429);
  });

  it("uses bucketKey prefix 'rewards-balance:' with trades config", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    viewSelectMock.mockResolvedValue({ data: [], error: null });

    await GET(makeReq() as never);

    expect(mockedRL).toHaveBeenCalledWith(
      `rewards-balance:${PUBKEY}`,
      "trades"
    );
  });

  it("returns empty pending array when holder has no rewards", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    viewSelectMock.mockResolvedValue({ data: [], error: null });

    const res = await GET(makeReq() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ pending: [] });
  });

  it("returns aggregated pending entries with creator metadata", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    viewSelectMock.mockResolvedValue({
      data: [
        {
          holder_deso_public_key: PUBKEY,
          token_slug: "bitcoin",
          token_type: "crypto",
          row_count: 4,
          total_usd: "0.00927301",
        },
      ],
      error: null,
    });
    creatorsSelectMock.mockResolvedValue({
      data: [
        {
          slug: "bitcoin",
          deso_public_key: "BC1YLbtcCREATORxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        },
      ],
      error: null,
    });

    const res = await GET(makeReq() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pending).toHaveLength(1);
    expect(body.pending[0]).toMatchObject({
      tokenSlug: "bitcoin",
      tokenType: "crypto",
      rowCount: 4,
      totalUsd: "0.00927301",
      displayLabel: "$bitcoin",
      creatorPublicKey: expect.stringMatching(/^BC1Y/),
    });
  });

  it("falls back to $slug display label when creator metadata missing", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    viewSelectMock.mockResolvedValue({
      data: [
        {
          holder_deso_public_key: PUBKEY,
          token_slug: "obscure-token",
          token_type: "category",
          row_count: 1,
          total_usd: "0.001",
        },
      ],
      error: null,
    });
    // creators query returns nothing (token has no creator profile)
    creatorsSelectMock.mockResolvedValue({ data: [], error: null });

    const res = await GET(makeReq() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pending[0]).toMatchObject({
      tokenSlug: "obscure-token",
      displayLabel: "$obscure-token",
      creatorPublicKey: null,
    });
  });

  it("returns 500 when view query errors", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    viewSelectMock.mockResolvedValue({
      data: null,
      error: { message: "view broken" },
    });

    const res = await GET(makeReq() as never);
    expect(res.status).toBe(500);
  });

  it("returns 500 when creators query errors", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    viewSelectMock.mockResolvedValue({
      data: [
        {
          holder_deso_public_key: PUBKEY,
          token_slug: "bitcoin",
          token_type: "crypto",
          row_count: 4,
          total_usd: "0.001",
        },
      ],
      error: null,
    });
    creatorsSelectMock.mockResolvedValue({
      data: null,
      error: { message: "creators table down" },
    });

    const res = await GET(makeReq() as never);
    expect(res.status).toBe(500);
  });

  it("handles multiple tokens correctly", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    viewSelectMock.mockResolvedValue({
      data: [
        {
          holder_deso_public_key: PUBKEY,
          token_slug: "bitcoin",
          token_type: "crypto",
          row_count: 4,
          total_usd: "0.005",
        },
        {
          holder_deso_public_key: PUBKEY,
          token_slug: "calderacreators",
          token_type: "category",
          row_count: 2,
          total_usd: "0.001",
        },
      ],
      error: null,
    });
    creatorsSelectMock.mockResolvedValue({
      data: [
        { slug: "bitcoin", deso_public_key: "BC1Ybtc" },
        { slug: "calderacreators", deso_public_key: "BC1Ycreators" },
      ],
      error: null,
    });

    const res = await GET(makeReq() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pending).toHaveLength(2);
    expect(body.pending[0].displayLabel).toBe("$bitcoin");
    expect(body.pending[1].displayLabel).toBe("$calderacreators");
  });
});
