import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock all dependencies BEFORE imports.
vi.mock("@/lib/admin/auth", () => ({
  isAdminAuthorized: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/reconciliation/sweep", () => ({
  sweepPositionPayouts: vi.fn(),
  sweepCreatorClaimPayouts: vi.fn(),
}));

vi.mock("@/lib/reconciliation/drift-check", () => ({
  driftCheckPositionPayouts: vi.fn(),
  driftCheckCreatorClaimPayouts: vi.fn(),
}));

import { POST } from "@/app/api/admin/reconcile/route";
import { isAdminAuthorized } from "@/lib/admin/auth";
import {
  sweepPositionPayouts,
  sweepCreatorClaimPayouts,
} from "@/lib/reconciliation/sweep";
import {
  driftCheckPositionPayouts,
  driftCheckCreatorClaimPayouts,
} from "@/lib/reconciliation/drift-check";

const mockedAuth = isAdminAuthorized as ReturnType<typeof vi.fn>;
const mockedSweepPP = sweepPositionPayouts as ReturnType<typeof vi.fn>;
const mockedSweepCC = sweepCreatorClaimPayouts as ReturnType<typeof vi.fn>;
const mockedDriftPP = driftCheckPositionPayouts as ReturnType<typeof vi.fn>;
const mockedDriftCC = driftCheckCreatorClaimPayouts as ReturnType<typeof vi.fn>;

function emptySweep(table: string) {
  return {
    table,
    swept: 0,
    confirmed: 0,
    failed: 0,
    stillPending: 0,
    driftAlerts: 0,
    errors: 0,
  };
}

function emptyDrift(table: string) {
  return {
    table,
    claimedRows: 0,
    ledgerSumNanos: "0",
    onchainSumNanos: "0",
    diffNanos: "0",
    toleranceNanos: "0",
    withinThreshold: true,
    unmatched: [],
    errors: 0,
  };
}

function makeReq(
  body: unknown,
  options: { headers?: Record<string, string> } = {}
) {
  return new Request("http://localhost/api/admin/reconcile", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  mockedAuth.mockReset().mockReturnValue(true);
  mockedSweepPP.mockReset().mockResolvedValue(emptySweep("position_payouts"));
  mockedSweepCC.mockReset().mockResolvedValue(
    emptySweep("creator_claim_payouts")
  );
  mockedDriftPP.mockReset().mockResolvedValue(emptyDrift("position_payouts"));
  mockedDriftCC.mockReset().mockResolvedValue(
    emptyDrift("creator_claim_payouts")
  );

  process.env.DESO_PLATFORM_PUBLIC_KEY = "BC1YLPLATFORM";
});

describe("POST /api/admin/reconcile", () => {
  it("Gate 1: bad JSON → 400 bad-body", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeReq("not json") as any);
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("bad-body");
  });

  it("Gate 2: invalid tables value → 400 bad-body", async () => {
    const res = await POST(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeReq({
        adminPassword: "x",
        tables: ["holder_rewards"], // not in supported set
      }) as any
    );
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("bad-body");
  });

  it("Gate 3: auth fails → 401", async () => {
    mockedAuth.mockReturnValue(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeReq({ adminPassword: "wrong" }) as any);
    expect(res.status).toBe(401);
  });

  it("Gate 4: missing platform env → 503 platform-wallet-unavailable", async () => {
    delete process.env.DESO_PLATFORM_PUBLIC_KEY;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeReq({ adminPassword: "x" }) as any);
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe("platform-wallet-unavailable");
  });

  it("Happy path: 200 + both tables swept + drift-checked", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeReq({ adminPassword: "x" }) as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.triggeredBy).toBe("manual");
    expect(json.sweepResults).toHaveLength(2);
    expect(json.driftResults).toHaveLength(2);
    expect(mockedSweepPP).toHaveBeenCalledTimes(1);
    expect(mockedSweepCC).toHaveBeenCalledTimes(1);
    expect(mockedDriftPP).toHaveBeenCalledTimes(1);
    expect(mockedDriftCC).toHaveBeenCalledTimes(1);
  });

  it("tables filter: only position_payouts → libs called for only that table", async () => {
    const res = await POST(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeReq({
        adminPassword: "x",
        tables: ["position_payouts"],
      }) as any
    );
    expect(res.status).toBe(200);
    expect(mockedSweepPP).toHaveBeenCalledTimes(1);
    expect(mockedSweepCC).not.toHaveBeenCalled();
    expect(mockedDriftPP).toHaveBeenCalledTimes(1);
    expect(mockedDriftCC).not.toHaveBeenCalled();
  });

  it("x-vercel-cron header → triggeredBy='cron'", async () => {
    const res = await POST(
      makeReq(
        { adminPassword: "x" },
        { headers: { "x-vercel-cron": "1" } }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any
    );
    const json = await res.json();
    expect(json.triggeredBy).toBe("cron");
    // Verify lib received the trigger
    expect(mockedSweepPP).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ triggeredBy: "cron" })
    );
  });

  it("no x-vercel-cron header → triggeredBy='manual'", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeReq({ adminPassword: "x" }) as any);
    const json = await res.json();
    expect(json.triggeredBy).toBe("manual");
  });

  it("sweep lib throws → captured in result row, no 500", async () => {
    mockedSweepPP.mockRejectedValueOnce(new Error("boom"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeReq({ adminPassword: "x" }) as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    // Failed sweep result has errors=1
    expect(json.sweepResults[0].errors).toBe(1);
    // Drift still ran
    expect(mockedDriftPP).toHaveBeenCalledTimes(1);
    // Other table still ran
    expect(json.sweepResults[1].table).toBe("creator_claim_payouts");
  });

  it("drift lib throws → captured in result row, no 500", async () => {
    mockedDriftPP.mockRejectedValueOnce(new Error("boom"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeReq({ adminPassword: "x" }) as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.driftResults[0].errors).toBe(1);
  });
});
