import { describe, it, expect, beforeEach, vi } from "vitest";

// All mocks BEFORE imports
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

vi.mock("@/lib/deso/transfer", () => ({
  transferCreatorCoin: vi.fn(),
}));

vi.mock("@/lib/deso/solvency", () => ({
  checkCreatorCoinSolvency: vi.fn(),
}));

vi.mock("@/lib/deso/api", () => ({
  getCreatorCoinData: vi.fn(),
}));

// Supabase chainable mock
// Route calls (in order):
//   creators: .select().eq().maybeSingle()
//   holder_rewards select: .select().eq().eq().eq()
//   holder_rewards update in_flight: .update({status:"in_flight"}).in().eq().select()
//   holder_rewards update blocked_insolvent: .update({status:"blocked_insolvent"}).in()
//   holder_rewards update failed: .update({status:"failed"}).in()
//   holder_rewards update claimed (×N): .update({...}).eq("id", id)

const creatorMaybeSingleMock = vi.fn();
const pendingEqStatusMock = vi.fn();
const lockSelectMock = vi.fn();
const updateBlockedMock = vi.fn();
const updateFailedMock = vi.fn();
const updateClaimedMock = vi.fn();

const fromMock = vi.fn((table: string) => {
  if (table === "creators") {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: creatorMaybeSingleMock,
        }),
      }),
    };
  }
  if (table === "holder_rewards") {
    return {
      // select chain: .select("id, amount_usd").eq().eq().eq()
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: pendingEqStatusMock,
          }),
        }),
      }),
      // update chains vary by status
      update: (updateData: { status: string }) => {
        if (updateData.status === "in_flight") {
          return {
            in: () => ({
              eq: () => ({ select: lockSelectMock }),
            }),
          };
        }
        if (updateData.status === "blocked_insolvent") {
          return { in: updateBlockedMock };
        }
        if (updateData.status === "failed") {
          return { in: updateFailedMock };
        }
        // claimed: .update({status:"claimed",...}).eq("id", id)
        return { eq: updateClaimedMock };
      },
    };
  }
  throw new Error(`unexpected table: ${table}`);
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from: fromMock })),
}));

import { POST } from "@/app/api/holder-rewards/claim/route";
import { getAuthenticatedUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { transferCreatorCoin } from "@/lib/deso/transfer";
import { checkCreatorCoinSolvency } from "@/lib/deso/solvency";
import { getCreatorCoinData } from "@/lib/deso/api";

const PUBKEY = "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7";
const CREATOR = "BC1YLfg6RFHGXsKzZFyEKUmJ869eBeXMKH2xiuxrPw1ZuBxVRy1yXDg";

const mockedAuth = getAuthenticatedUser as ReturnType<typeof vi.fn>;
const mockedRL = checkRateLimit as ReturnType<typeof vi.fn>;
const mockedTransfer = transferCreatorCoin as ReturnType<typeof vi.fn>;
const mockedSolvency = checkCreatorCoinSolvency as ReturnType<typeof vi.fn>;
const mockedPrice = getCreatorCoinData as ReturnType<typeof vi.fn>;

function makeReq(body: unknown) {
  return new Request("http://localhost/api/holder-rewards/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
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
  mockedTransfer.mockReset();
  mockedSolvency.mockReset();
  mockedPrice.mockReset();
  creatorMaybeSingleMock.mockReset();
  pendingEqStatusMock.mockReset();
  lockSelectMock.mockReset();
  updateBlockedMock.mockReset().mockResolvedValue({ data: null, error: null });
  updateFailedMock.mockReset().mockResolvedValue({ data: null, error: null });
  updateClaimedMock.mockReset().mockResolvedValue({ data: null, error: null });

  // Platform env vars present by default
  process.env.DESO_PLATFORM_PUBLIC_KEY =
    "BC1YLPLATFORMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  process.env.DESO_PLATFORM_SEED = "deadbeef".repeat(16);
});

// Shared happy-path setup — call at top of any test that needs to
// reach the transfer step or beyond.
function happyPathDefaults() {
  creatorMaybeSingleMock.mockResolvedValue({
    data: { slug: "bitcoin", deso_public_key: CREATOR },
    error: null,
  });
  pendingEqStatusMock.mockResolvedValue({
    data: [
      { id: "row-1", amount_usd: "0.005" },
      { id: "row-2", amount_usd: "0.005" },
    ],
    error: null,
  });
  mockedPrice.mockResolvedValue({ priceUSD: 5.0 });
  mockedSolvency.mockResolvedValue({ ok: true, available: BigInt(9_999_999_999) });
  lockSelectMock.mockResolvedValue({
    data: [{ id: "row-1" }, { id: "row-2" }],
    error: null,
  });
  mockedTransfer.mockResolvedValue({
    ok: true,
    txHashHex: "abc123def456",
    feeNanos: 168,
  });
}

describe("POST /api/holder-rewards/claim — gates", () => {
  it("Gate 1: returns 401 when not authenticated", async () => {
    mockedAuth.mockReturnValue(null);
    const res = await POST(makeReq({ tokenSlug: "bitcoin" }) as never);
    expect(res.status).toBe(401);
  });

  it("Gate 2: returns 429 when rate limit denies", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedRL.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });
    const res = await POST(makeReq({ tokenSlug: "bitcoin" }) as never);
    expect(res.status).toBe(429);
  });

  it("Gate 3: returns 400 on malformed body (missing tokenSlug)", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    const res = await POST(makeReq({}) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe("bad-body");
  });

  it("Platform misconfig: returns 503 when env vars missing", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    delete process.env.DESO_PLATFORM_PUBLIC_KEY;
    const res = await POST(makeReq({ tokenSlug: "bitcoin" }) as never);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.reason).toBe("platform-wallet-unavailable");
  });

  it("Gate 4: returns 404 when token has no creator profile", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    creatorMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    const res = await POST(makeReq({ tokenSlug: "ghost-token" }) as never);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.reason).toBe("token-not-claimable");
  });

  it("Gate 5: returns 404 when no pending rewards exist", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    creatorMaybeSingleMock.mockResolvedValue({
      data: { slug: "bitcoin", deso_public_key: CREATOR },
      error: null,
    });
    pendingEqStatusMock.mockResolvedValue({ data: [], error: null });
    const res = await POST(makeReq({ tokenSlug: "bitcoin" }) as never);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.reason).toBe("no-pending-rewards");
  });

  it("Gate 6: returns 503 when price fetch throws", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    creatorMaybeSingleMock.mockResolvedValue({
      data: { slug: "bitcoin", deso_public_key: CREATOR },
      error: null,
    });
    pendingEqStatusMock.mockResolvedValue({
      data: [{ id: "r1", amount_usd: "0.01" }],
      error: null,
    });
    mockedPrice.mockRejectedValue(new Error("DeSo API down"));
    const res = await POST(makeReq({ tokenSlug: "bitcoin" }) as never);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.reason).toBe("price-fetch-failed");
  });

  it("Gate 6: returns 400 when computed nanos < 1 (tiny amount, expensive coin)", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    creatorMaybeSingleMock.mockResolvedValue({
      data: { slug: "bitcoin", deso_public_key: CREATOR },
      error: null,
    });
    pendingEqStatusMock.mockResolvedValue({
      data: [{ id: "r1", amount_usd: "0.0000000000001" }],
      error: null,
    });
    mockedPrice.mockResolvedValue({ priceUSD: 1_000_000 });
    const res = await POST(makeReq({ tokenSlug: "bitcoin" }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe("amount-too-small");
  });

  it("Gate 7: marks rows blocked_insolvent and returns 503 on insufficient", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    happyPathDefaults();
    mockedSolvency.mockResolvedValue({
      ok: false,
      reason: "insufficient",
      required: BigInt(100),
      available: BigInt(50),
    });

    const res = await POST(makeReq({ tokenSlug: "bitcoin" }) as never);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.reason).toBe("platform-insufficient-funds");
    expect(updateBlockedMock).toHaveBeenCalled();
  });

  it("Gate 8: returns 409 on concurrent claim race (lock returns fewer rows)", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    happyPathDefaults();
    // 2 rows expected, lock only returns 1 — another request won the race
    lockSelectMock.mockResolvedValue({
      data: [{ id: "row-1" }],
      error: null,
    });

    const res = await POST(makeReq({ tokenSlug: "bitcoin" }) as never);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.reason).toBe("concurrent-claim");
  });

  it("Gate 9: marks rows failed and returns 500 when transfer fails", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    happyPathDefaults();
    mockedTransfer.mockResolvedValue({
      ok: false,
      reason: "submit-failed",
      detail: "DeSo rejected",
    });

    const res = await POST(makeReq({ tokenSlug: "bitcoin" }) as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.reason).toBe("submit-failed");
    expect(updateFailedMock).toHaveBeenCalled();
  });

  it("Happy path: returns 200 with txHashHex and correct shape", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    happyPathDefaults();

    const res = await POST(makeReq({ tokenSlug: "bitcoin" }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      txHashHex: "abc123def456",
      tokenSlug: "bitcoin",
      rowsCount: 2,
    });
    expect(body.claimedNanos).toBeDefined();
    expect(body.claimedUsd).toMatch(/^\d+\.\d{8}$/);
    expect(updateClaimedMock).toHaveBeenCalledTimes(2);
  });

  it("Happy path: solvency called with correct creator + nanos as bigint", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    happyPathDefaults();

    await POST(makeReq({ tokenSlug: "bitcoin" }) as never);

    expect(mockedSolvency).toHaveBeenCalled();
    const call = mockedSolvency.mock.calls[0];
    expect(call[1]).toBe(CREATOR);
    expect(typeof call[2]).toBe("bigint");
  });

  it("Happy path: transfer called with correct creatorPublicKey + recipientPublicKey", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    happyPathDefaults();

    await POST(makeReq({ tokenSlug: "bitcoin" }) as never);

    expect(mockedTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorPublicKey: CREATOR,
        recipientPublicKey: PUBKEY,
      })
    );
  });

  it("Happy path: nanos computation is proportional to sumUsd / priceUsdPerCoin", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    happyPathDefaults();
    // sumUsd = 0.01, priceUSD = 5.0 → coinAmount = 0.002
    // coinNanos = floor(0.002 * 1e9) = 2_000_000

    await POST(makeReq({ tokenSlug: "bitcoin" }) as never);

    const call = mockedTransfer.mock.calls[0][0];
    expect(call.creatorCoinNanos).toBe(BigInt(2_000_000));
  });
});
