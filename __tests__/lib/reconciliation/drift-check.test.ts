import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/deso/verifyTx", () => ({
  verifyDesoTransfer: vi.fn(),
}));

import {
  driftCheckPositionPayouts,
  driftCheckCreatorClaimPayouts,
} from "@/lib/reconciliation/drift-check";
import { verifyDesoTransfer } from "@/lib/deso/verifyTx";

const mockedVerify = verifyDesoTransfer as ReturnType<typeof vi.fn>;

const PLATFORM_PUBKEY = "BC1YLPLATFORM";
const USER_PUBKEY = "BC1YLUSER";
const CREATOR_PUBKEY = "BC1YLCREATOR";

const ROW_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROW_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TX_A = "txhash_a";
const TX_B = "txhash_b";

// Mock factory tailored to drift-check's chain shapes:
//   SELECT: from().select().eq().not().limit?()  → resolves to {data, error}
//   INSERT: from("drift_alerts").insert()
function makeSupabaseMocks() {
  const driftAlertInserts: unknown[] = [];

  const state: {
    selectRows: Record<string, unknown[] | { error: { message: string } }>;
  } = { selectRows: {} };

  const selectChainResult = (table: string) => {
    const data = state.selectRows[table];
    if (Array.isArray(data)) {
      return Promise.resolve({ data, error: null });
    }
    if (data && "error" in data) {
      return Promise.resolve({ data: null, error: (data as { error: { message: string } }).error });
    }
    return Promise.resolve({ data: [], error: null });
  };

  const fromMock = vi.fn((table: string) => {
    if (table === "drift_alerts") {
      return {
        insert: (row: unknown) => {
          driftAlertInserts.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }

    // Build a chainable+thenable result for the SELECT path.
    // Each of .select() / .eq() / .not() / .limit() returns the same
    // chainable proxy, and any await on it resolves the data/error.
    const chainable = {
      select: () => chainable,
      eq: () => chainable,
      not: () => chainable,
      limit: () => chainable,
      then: (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
        selectChainResult(table).then(resolve),
    };
    return chainable;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = { from: fromMock } as any;
  return { supabase, state, driftAlertInserts };
}

// ─── driftCheckPositionPayouts tests ─────────────────────────────

describe("driftCheckPositionPayouts", () => {
  beforeEach(() => {
    mockedVerify.mockReset();
    process.env.DESO_PLATFORM_PUBLIC_KEY = PLATFORM_PUBKEY;
  });

  it("returns errors=1 if DESO_PLATFORM_PUBLIC_KEY missing", async () => {
    delete process.env.DESO_PLATFORM_PUBLIC_KEY;
    const { supabase } = makeSupabaseMocks();
    const result = await driftCheckPositionPayouts(supabase);
    expect(result.errors).toBe(1);
    expect(result.claimedRows).toBe(0);
  });

  it("empty rows → all sums 0, withinThreshold=true", async () => {
    const { supabase, state } = makeSupabaseMocks();
    state.selectRows["position_payouts"] = [];
    const result = await driftCheckPositionPayouts(supabase);
    expect(result.claimedRows).toBe(0);
    expect(result.ledgerSumNanos).toBe("0");
    expect(result.onchainSumNanos).toBe("0");
    expect(result.withinThreshold).toBe(true);
    expect(result.unmatched).toEqual([]);
  });

  it("single confirmed row → sums match exactly, no drift alert", async () => {
    const { supabase, state, driftAlertInserts } = makeSupabaseMocks();
    state.selectRows["position_payouts"] = [
      {
        id: ROW_A,
        user_id: "u1",
        payout_amount_nanos: "500000000",
        claim_tx_hash: TX_A,
        users: { deso_public_key: USER_PUBKEY },
      },
    ];
    mockedVerify.mockResolvedValue({
      ok: true,
      actualAmountNanos: 500000000,
      blockHashHex: "block",
    });

    const result = await driftCheckPositionPayouts(supabase);
    expect(result.claimedRows).toBe(1);
    expect(result.ledgerSumNanos).toBe("500000000");
    expect(result.onchainSumNanos).toBe("500000000");
    expect(result.diffNanos).toBe("0");
    expect(result.withinThreshold).toBe(true);
    expect(result.unmatched).toEqual([]);
    // Tolerance = 168 * 1 + 1000 = 1168
    expect(result.toleranceNanos).toBe("1168");
    // No drift alert fired
    expect(driftAlertInserts).toHaveLength(0);
  });

  it("sums diverge within tolerance → no WARN alert", async () => {
    const { supabase, state, driftAlertInserts } = makeSupabaseMocks();
    state.selectRows["position_payouts"] = [
      {
        id: ROW_A,
        user_id: "u1",
        payout_amount_nanos: "500000000",
        claim_tx_hash: TX_A,
        users: { deso_public_key: USER_PUBKEY },
      },
    ];
    // verify returns slightly different amount (within 168+1000 tolerance)
    mockedVerify.mockResolvedValue({
      ok: true,
      actualAmountNanos: 500000168,
      blockHashHex: "block",
    });

    const result = await driftCheckPositionPayouts(supabase);
    expect(result.diffNanos).toBe("168");
    expect(result.withinThreshold).toBe(true);
    expect(driftAlertInserts).toHaveLength(0);
  });

  it("sums diverge beyond tolerance → WARN drift_alert fired", async () => {
    const { supabase, state, driftAlertInserts } = makeSupabaseMocks();
    state.selectRows["position_payouts"] = [
      {
        id: ROW_A,
        user_id: "u1",
        payout_amount_nanos: "500000000",
        claim_tx_hash: TX_A,
        users: { deso_public_key: USER_PUBKEY },
      },
    ];
    // diff of 100,000 nanos vs tolerance of 1168 → exceeds
    mockedVerify.mockResolvedValue({
      ok: true,
      actualAmountNanos: 500100000,
      blockHashHex: "block",
    });

    const result = await driftCheckPositionPayouts(supabase);
    expect(result.diffNanos).toBe("100000");
    expect(result.withinThreshold).toBe(false);

    // Alert fired
    expect(driftAlertInserts).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alert = driftAlertInserts[0] as any;
    expect(alert.alert_type).toBe("drift_detected");
    expect(alert.severity).toBe("WARN");
    expect(alert.diff_nanos).toBe("100000");
  });

  it("row tx-not-found → CRITICAL alert + unmatched[] populated", async () => {
    const { supabase, state, driftAlertInserts } = makeSupabaseMocks();
    state.selectRows["position_payouts"] = [
      {
        id: ROW_A,
        user_id: "u1",
        payout_amount_nanos: "500000000",
        claim_tx_hash: TX_A,
        users: { deso_public_key: USER_PUBKEY },
      },
    ];
    mockedVerify.mockResolvedValue({
      ok: false,
      reason: "tx-not-found",
      detail: "no",
    });

    const result = await driftCheckPositionPayouts(supabase);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].rowId).toBe(ROW_A);
    expect(result.unmatched[0].verifyReason).toBe("tx-not-found");

    // CRITICAL per-row alert + WARN coarse-sum alert (ledger=500M, onchain=0 → diff >> tolerance)
    expect(driftAlertInserts).toHaveLength(2);
    const criticalAlert = (driftAlertInserts as any[]).find(
      (a: any) => a.severity === "CRITICAL"
    );
    expect(criticalAlert).toBeDefined();
  });

  it("row sender-mismatch → CRITICAL alert + unmatched[] populated", async () => {
    const { supabase, state, driftAlertInserts } = makeSupabaseMocks();
    state.selectRows["position_payouts"] = [
      {
        id: ROW_A,
        user_id: "u1",
        payout_amount_nanos: "500000000",
        claim_tx_hash: TX_A,
        users: { deso_public_key: USER_PUBKEY },
      },
    ];
    mockedVerify.mockResolvedValue({
      ok: false,
      reason: "sender-mismatch",
      detail: "wrong sender",
    });

    const result = await driftCheckPositionPayouts(supabase);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].verifyReason).toBe("sender-mismatch");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alert = driftAlertInserts[0] as any;
    expect(alert.severity).toBe("CRITICAL");
  });

  it("API unreachable → counted as error, no drift alarm, no unmatched entry", async () => {
    const { supabase, state, driftAlertInserts } = makeSupabaseMocks();
    state.selectRows["position_payouts"] = [
      {
        id: ROW_A,
        user_id: "u1",
        payout_amount_nanos: "500000000",
        claim_tx_hash: TX_A,
        users: { deso_public_key: USER_PUBKEY },
      },
    ];
    mockedVerify.mockResolvedValue({
      ok: false,
      reason: "deso-api-unreachable",
    });

    const result = await driftCheckPositionPayouts(supabase);
    expect(result.errors).toBe(1);
    expect(result.unmatched).toHaveLength(0);
    // api-unreachable: neither sum is updated → diff=0 → no WARN alert
    expect(driftAlertInserts).toHaveLength(0);
  });

  it("multiple rows mixed outcomes → counts all correctly", async () => {
    const { supabase, state, driftAlertInserts } = makeSupabaseMocks();
    state.selectRows["position_payouts"] = [
      {
        id: ROW_A,
        user_id: "u1",
        payout_amount_nanos: "300000000",
        claim_tx_hash: TX_A,
        users: { deso_public_key: USER_PUBKEY },
      },
      {
        id: ROW_B,
        user_id: "u2",
        payout_amount_nanos: "400000000",
        claim_tx_hash: TX_B,
        users: { deso_public_key: USER_PUBKEY },
      },
    ];
    // First row: confirmed
    // Second row: tx-not-found
    mockedVerify
      .mockResolvedValueOnce({
        ok: true,
        actualAmountNanos: 300000000,
        blockHashHex: "block_a",
      })
      .mockResolvedValueOnce({
        ok: false,
        reason: "tx-not-found",
      });

    const result = await driftCheckPositionPayouts(supabase);
    expect(result.claimedRows).toBe(2);
    expect(result.ledgerSumNanos).toBe("700000000");
    // onchain sum only adds the confirmed row
    expect(result.onchainSumNanos).toBe("300000000");
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].rowId).toBe(ROW_B);

    // CRITICAL for ROW_B + WARN for sum drift (700M vs 300M = 400M >> tolerance)
    expect(driftAlertInserts.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── driftCheckCreatorClaimPayouts tests ────────────────────────

describe("driftCheckCreatorClaimPayouts", () => {
  beforeEach(() => {
    mockedVerify.mockReset();
    process.env.DESO_PLATFORM_PUBLIC_KEY = PLATFORM_PUBKEY;
  });

  it("returns errors=1 if DESO_PLATFORM_PUBLIC_KEY missing", async () => {
    delete process.env.DESO_PLATFORM_PUBLIC_KEY;
    const { supabase } = makeSupabaseMocks();
    const result = await driftCheckCreatorClaimPayouts(supabase);
    expect(result.errors).toBe(1);
  });

  it("confirmed row → sums match, no drift alert", async () => {
    const { supabase, state, driftAlertInserts } = makeSupabaseMocks();
    state.selectRows["creator_claim_payouts"] = [
      {
        id: ROW_A,
        creator_id: "c1",
        amount_nanos: "200000000",
        tx_hash: TX_A,
        creators: { deso_public_key: CREATOR_PUBKEY },
      },
    ];
    mockedVerify.mockResolvedValue({
      ok: true,
      actualAmountNanos: 200000000,
      blockHashHex: "block",
    });

    const result = await driftCheckCreatorClaimPayouts(supabase);
    expect(result.ledgerSumNanos).toBe("200000000");
    expect(result.onchainSumNanos).toBe("200000000");
    expect(result.withinThreshold).toBe(true);
    expect(driftAlertInserts).toHaveLength(0);
  });

  it("tx-not-found → CRITICAL alert + unmatched", async () => {
    const { supabase, state, driftAlertInserts } = makeSupabaseMocks();
    state.selectRows["creator_claim_payouts"] = [
      {
        id: ROW_A,
        creator_id: "c1",
        amount_nanos: "200000000",
        tx_hash: TX_A,
        creators: { deso_public_key: CREATOR_PUBKEY },
      },
    ];
    mockedVerify.mockResolvedValue({
      ok: false,
      reason: "tx-not-found",
    });

    const result = await driftCheckCreatorClaimPayouts(supabase);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].rowId).toBe(ROW_A);
    // CRITICAL per-row + WARN coarse-sum (ledger=200M, onchain=0 → diff >> tolerance)
    expect(driftAlertInserts).toHaveLength(2);
    const criticalAlert = (driftAlertInserts as any[]).find(
      (a: any) => a.severity === "CRITICAL"
    );
    expect(criticalAlert).toBeDefined();
  });
});
