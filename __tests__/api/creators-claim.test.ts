import { describe, it, expect, beforeEach, vi } from "vitest";

// Mocks BEFORE imports
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/auth/deso-jwt", () => ({
  verifyFreshDesoJwt: vi.fn(),
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

vi.mock("@/lib/deso/rate", () => ({
  fetchDesoUsdRate: vi.fn(),
}));

// Supabase chainable mock
const creatorMaybeSingleMock = vi.fn();
const activeLimitMock = vi.fn();
const auditInsertSingleMock = vi.fn();
const updateSelectMock = vi.fn();
const failedUpdateMock = vi.fn();
const rpcMock = vi.fn();

const fromMock = vi.fn((table: string) => {
  if (table === "creators") {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: creatorMaybeSingleMock,
        }),
      }),
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: updateSelectMock,
          }),
        }),
      }),
    };
  }
  if (table === "creator_claim_payouts") {
    return {
      select: () => ({
        eq: () => ({
          in: () => ({
            limit: activeLimitMock,
          }),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: auditInsertSingleMock,
        }),
      }),
      update: () => ({
        eq: failedUpdateMock,
      }),
    };
  }
  throw new Error(`unexpected table: ${table}`);
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({ from: fromMock, rpc: rpcMock })),
}));

import { POST } from "@/app/api/creators/[slug]/claim/route";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyFreshDesoJwt } from "@/lib/auth/deso-jwt";
import { checkRateLimit } from "@/lib/rate-limit";
import { transferDeso } from "@/lib/deso/transferDeso";
import { checkDesoSolvency } from "@/lib/deso/solvency";
import { fetchDesoUsdRate } from "@/lib/deso/rate";

const PUBKEY = "BC1YLhriEzhGkrKzUGmL3B4Zdq9S63oGVSYMhUV1UT5vDoRieHceZBB";
const CREATOR_ID = "34d6cca5-bf07-41ac-a0d8-6e1d9bfa010f";

const mockedAuth = getAuthenticatedUser as ReturnType<typeof vi.fn>;
const mockedJwt = verifyFreshDesoJwt as ReturnType<typeof vi.fn>;
const mockedRL = checkRateLimit as ReturnType<typeof vi.fn>;
const mockedTransfer = transferDeso as ReturnType<typeof vi.fn>;
const mockedSolvency = checkDesoSolvency as ReturnType<typeof vi.fn>;
const mockedRate = fetchDesoUsdRate as ReturnType<typeof vi.fn>;

function makeReq(body: unknown) {
  return new Request("http://localhost/api/creators/test/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}
const params = Promise.resolve({ slug: "test-creator" });

beforeEach(() => {
  mockedAuth.mockReset();
  mockedJwt.mockReset().mockResolvedValue({ ok: true });
  mockedRL.mockReset().mockResolvedValue({
    allowed: true, remaining: 9, resetAt: Date.now() + 60_000,
  });
  mockedTransfer.mockReset();
  mockedSolvency.mockReset();
  mockedRate.mockReset();
  creatorMaybeSingleMock.mockReset();
  activeLimitMock.mockReset().mockResolvedValue({ data: [], error: null });
  auditInsertSingleMock.mockReset();
  updateSelectMock.mockReset();
  failedUpdateMock.mockReset().mockResolvedValue({ data: null, error: null });
  rpcMock.mockReset();

  process.env.DESO_PLATFORM_PUBLIC_KEY = "BC1YLPLATFORMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  process.env.DESO_PLATFORM_SEED = "deadbeef".repeat(16);
});

const okJwt = { ok: true } as const;

// Reusable creator row
function unclaimedApprovedCreator(escrowUsd = "0.01"): unknown {
  return {
    id: CREATOR_ID,
    slug: "test-creator",
    deso_public_key: null,
    tier: "unclaimed",
    claim_status: "unclaimed",
    verification_status: "approved",
    claim_attempted_by: null,
    unclaimed_earnings_escrow: escrowUsd,
    claimed_at: null,
  };
}

function claimedCreator(escrowUsd = "0.01"): unknown {
  return {
    id: CREATOR_ID,
    slug: "test-creator",
    deso_public_key: PUBKEY,
    tier: "verified_creator",
    claim_status: "claimed",
    verification_status: "approved",
    claim_attempted_by: PUBKEY,
    unclaimed_earnings_escrow: escrowUsd,
    claimed_at: "2026-04-26T00:00:00Z",
  };
}

describe("POST /api/creators/[slug]/claim", () => {
  it("Gate 1: returns 401 when not authenticated", async () => {
    mockedAuth.mockReturnValue(null);
    const res = await POST(makeReq({ desoJwt: "abc" }) as never, { params });
    expect(res.status).toBe(401);
  });

  it("Gate 1b: returns 400 on malformed body", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    const res = await POST(makeReq({}) as never, { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe("bad-body");
  });

  it("Gate 1b: returns 401 when fresh-JWT invalid", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedJwt.mockResolvedValue({ ok: false, reason: "stale" });
    const res = await POST(makeReq({ desoJwt: "abc" }) as never, { params });
    expect(res.status).toBe(401);
  });

  it("Gate 2: returns 429 when rate limit denies", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedJwt.mockResolvedValue(okJwt);
    mockedRL.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000 });
    const res = await POST(makeReq({ desoJwt: "abc" }) as never, { params });
    expect(res.status).toBe(429);
  });

  it("Platform misconfig: 503 when env missing", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedJwt.mockResolvedValue(okJwt);
    delete process.env.DESO_PLATFORM_PUBLIC_KEY;
    const res = await POST(makeReq({ desoJwt: "abc" }) as never, { params });
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe("platform-wallet-unavailable");
  });

  it("Gate 3: 404 when creator slug not found", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedJwt.mockResolvedValue(okJwt);
    creatorMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    const res = await POST(makeReq({ desoJwt: "abc" }) as never, { params });
    expect(res.status).toBe(404);
  });

  it("Gate 4: 400 profile-not-verified when verification_status pending", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedJwt.mockResolvedValue(okJwt);
    creatorMaybeSingleMock.mockResolvedValue({
      data: { ...(unclaimedApprovedCreator() as object), verification_status: "pending" },
      error: null,
    });
    const res = await POST(makeReq({ desoJwt: "abc" }) as never, { params });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("profile-not-verified");
  });

  it("Gate 5: 403 not-claimer when claim_attempted_by mismatches (unclaimed path)", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedJwt.mockResolvedValue(okJwt);
    creatorMaybeSingleMock.mockResolvedValue({
      data: { ...(unclaimedApprovedCreator() as object), claim_attempted_by: "BC1YLanother" },
      error: null,
    });
    const res = await POST(makeReq({ desoJwt: "abc" }) as never, { params });
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe("not-claimer");
  });

  it("Gate 5: 403 not-claimer when deso_public_key mismatches (claimed path)", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedJwt.mockResolvedValue(okJwt);
    creatorMaybeSingleMock.mockResolvedValue({
      data: { ...(claimedCreator() as object), deso_public_key: "BC1YLanother" },
      error: null,
    });
    const res = await POST(makeReq({ desoJwt: "abc" }) as never, { params });
    expect(res.status).toBe(403);
  });

  it("PATH A: profile-only claim (escrow=0, unclaimed) returns 200 + profileClaimed=true", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedJwt.mockResolvedValue(okJwt);
    creatorMaybeSingleMock.mockResolvedValue({
      data: unclaimedApprovedCreator("0"),
      error: null,
    });
    updateSelectMock.mockResolvedValue({
      data: [{ id: CREATOR_ID }],
      error: null,
    });

    const res = await POST(makeReq({ desoJwt: "abc" }) as never, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.profileClaimed).toBe(true);
    expect(body.txHashHex).toBeNull();
    expect(body.amountNanos).toBe("0");
  });

  it("PATH A concurrent: 409 when UPDATE returns 0 rows", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedJwt.mockResolvedValue(okJwt);
    creatorMaybeSingleMock.mockResolvedValue({
      data: unclaimedApprovedCreator("0"),
      error: null,
    });
    updateSelectMock.mockResolvedValue({ data: [], error: null });

    const res = await POST(makeReq({ desoJwt: "abc" }) as never, { params });
    expect(res.status).toBe(409);
  });

  it("Repeat path no balance: 400 no-balance", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedJwt.mockResolvedValue(okJwt);
    creatorMaybeSingleMock.mockResolvedValue({
      data: claimedCreator("0"),
      error: null,
    });
    const res = await POST(makeReq({ desoJwt: "abc" }) as never, { params });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("no-balance");
  });

  it("PATH B Gate 7: 409 when active in_flight row exists", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedJwt.mockResolvedValue(okJwt);
    creatorMaybeSingleMock.mockResolvedValue({
      data: claimedCreator("0.01"),
      error: null,
    });
    activeLimitMock.mockResolvedValue({
      data: [{ id: "existing-row" }],
      error: null,
    });
    const res = await POST(makeReq({ desoJwt: "abc" }) as never, { params });
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe("claim-in-progress");
  });

  it("PATH B Gate 8: 503 price-fetch-failed", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedJwt.mockResolvedValue(okJwt);
    creatorMaybeSingleMock.mockResolvedValue({
      data: claimedCreator("0.01"),
      error: null,
    });
    mockedRate.mockResolvedValue(null);
    const res = await POST(makeReq({ desoJwt: "abc" }) as never, { params });
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe("price-fetch-failed");
  });

  it("PATH B Gate 8: 400 amount-too-small", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedJwt.mockResolvedValue(okJwt);
    creatorMaybeSingleMock.mockResolvedValue({
      data: claimedCreator("0.0000000001"),
      error: null,
    });
    mockedRate.mockResolvedValue(5.0);
    const res = await POST(makeReq({ desoJwt: "abc" }) as never, { params });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("amount-too-small");
  });

  it("PATH B Gate 9: 503 platform-insufficient-funds", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedJwt.mockResolvedValue(okJwt);
    creatorMaybeSingleMock.mockResolvedValue({
      data: claimedCreator("0.01"),
      error: null,
    });
    mockedRate.mockResolvedValue(5.0);
    mockedSolvency.mockResolvedValue({
      ok: false, reason: "insufficient",
      required: BigInt(2_000_000), available: BigInt(1_000_000),
    });
    const res = await POST(makeReq({ desoJwt: "abc" }) as never, { params });
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe("platform-insufficient-funds");
  });

  it("PATH B Gate 10: 409 on unique violation (concurrent insert race)", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedJwt.mockResolvedValue(okJwt);
    creatorMaybeSingleMock.mockResolvedValue({
      data: claimedCreator("0.01"),
      error: null,
    });
    mockedRate.mockResolvedValue(5.0);
    mockedSolvency.mockResolvedValue({ ok: true, available: BigInt(9_999_999_999) });
    auditInsertSingleMock.mockResolvedValue({
      data: null,
      error: { message: "duplicate", code: "23505" },
    });
    const res = await POST(makeReq({ desoJwt: "abc" }) as never, { params });
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe("claim-in-progress");
  });

  it("PATH B Gate 11: 500 transfer failed → audit row marked failed", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedJwt.mockResolvedValue(okJwt);
    creatorMaybeSingleMock.mockResolvedValue({
      data: claimedCreator("0.01"),
      error: null,
    });
    mockedRate.mockResolvedValue(5.0);
    mockedSolvency.mockResolvedValue({ ok: true, available: BigInt(9_999_999_999) });
    auditInsertSingleMock.mockResolvedValue({
      data: { id: "audit-1" }, error: null,
    });
    mockedTransfer.mockResolvedValue({
      ok: false, reason: "submit-failed", detail: "DeSo rejected",
    });

    const res = await POST(makeReq({ desoJwt: "abc" }) as never, { params });
    expect(res.status).toBe(500);
    expect((await res.json()).reason).toBe("submit-failed");
    expect(failedUpdateMock).toHaveBeenCalled();
  });

  it("PATH B happy (repeat): 200 with txHashHex + profileClaimed=false", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedJwt.mockResolvedValue(okJwt);
    creatorMaybeSingleMock.mockResolvedValue({
      data: claimedCreator("0.01"),
      error: null,
    });
    mockedRate.mockResolvedValue(5.0);
    mockedSolvency.mockResolvedValue({ ok: true, available: BigInt(9_999_999_999) });
    auditInsertSingleMock.mockResolvedValue({
      data: { id: "audit-1" }, error: null,
    });
    mockedTransfer.mockResolvedValue({
      ok: true, txHashHex: "deadbeef", feeNanos: BigInt(168),
    });
    rpcMock.mockResolvedValue({ data: null, error: null });

    const res = await POST(makeReq({ desoJwt: "abc" }) as never, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.profileClaimed).toBe(false);
    expect(body.txHashHex).toBe("deadbeef");

    // Verify RPC was called with also_claim_profile=false
    const rpcCall = rpcMock.mock.calls[0];
    expect(rpcCall[1].p_also_claim_profile).toBe(false);
  });

  it("PATH B happy (first-time): 200 + profileClaimed=true + RPC also_claim_profile=true", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedJwt.mockResolvedValue(okJwt);
    creatorMaybeSingleMock.mockResolvedValue({
      data: unclaimedApprovedCreator("0.01"),
      error: null,
    });
    mockedRate.mockResolvedValue(5.0);
    mockedSolvency.mockResolvedValue({ ok: true, available: BigInt(9_999_999_999) });
    auditInsertSingleMock.mockResolvedValue({
      data: { id: "audit-1" }, error: null,
    });
    mockedTransfer.mockResolvedValue({
      ok: true, txHashHex: "deadbeef", feeNanos: BigInt(168),
    });
    rpcMock.mockResolvedValue({ data: null, error: null });

    const res = await POST(makeReq({ desoJwt: "abc" }) as never, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profileClaimed).toBe(true);
    expect(body.txHashHex).toBe("deadbeef");

    const rpcCall = rpcMock.mock.calls[0];
    expect(rpcCall[1].p_also_claim_profile).toBe(true);
    expect(rpcCall[1].p_recipient_pubkey).toBe(PUBKEY);
  });

  it("PATH B Gate 12: 500 ledger-update-failed when RPC fails", async () => {
    mockedAuth.mockReturnValue({ publicKey: PUBKEY });
    mockedJwt.mockResolvedValue(okJwt);
    creatorMaybeSingleMock.mockResolvedValue({
      data: claimedCreator("0.01"),
      error: null,
    });
    mockedRate.mockResolvedValue(5.0);
    mockedSolvency.mockResolvedValue({ ok: true, available: BigInt(9_999_999_999) });
    auditInsertSingleMock.mockResolvedValue({
      data: { id: "audit-1" }, error: null,
    });
    mockedTransfer.mockResolvedValue({
      ok: true, txHashHex: "deadbeef", feeNanos: BigInt(168),
    });
    rpcMock.mockResolvedValue({
      data: null, error: { message: "creator-not-found-or-state-mismatch" },
    });

    const res = await POST(makeReq({ desoJwt: "abc" }) as never, { params });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.reason).toBe("ledger-update-failed");
    expect(body.txHashHex).toBe("deadbeef");
  });
});
