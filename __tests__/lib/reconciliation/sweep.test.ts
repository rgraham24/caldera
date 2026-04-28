/**
 * P4-7a — Tests for lib/reconciliation/sweep.ts
 *
 * Coverage:
 *   - mapVerifyOutcome (pure function — no mocks needed)
 *   - sweepPositionPayouts (Supabase + verifyTx mocked)
 *   - sweepCreatorClaimPayouts (Supabase + verifyTx mocked)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mapVerifyOutcome,
  mapCctVerifyOutcome,
  sweepPositionPayouts,
  sweepCreatorClaimPayouts,
  sweepHolderRewards,
} from "@/lib/reconciliation/sweep";

// ── verifyTx mock ────────────────────────────────────────────────

vi.mock("@/lib/deso/verifyTx", () => ({
  verifyDesoTransfer: vi.fn(),
}));

vi.mock("@/lib/deso/verifyCreatorCoinTransfer", () => ({
  verifyCreatorCoinTransfer: vi.fn(),
}));

import { verifyDesoTransfer } from "@/lib/deso/verifyTx";
import { verifyCreatorCoinTransfer } from "@/lib/deso/verifyCreatorCoinTransfer";
const mockVerify = vi.mocked(verifyDesoTransfer);
const mockVerifyCct = vi.mocked(verifyCreatorCoinTransfer);

// ── Supabase mock factory ────────────────────────────────────────

type MockState = {
  selectRows: Record<string, unknown[]>;
  selectError: Record<string, unknown>;
  updateResult: Record<
    string,
    { data: unknown[]; error: unknown }
  >;
  insertError: unknown;
};

function makeSupabaseMock(state: MockState) {
  return {
    from: (table: string) => ({
      // SELECT chain: .select().eq().lt().limit()
      select: (_cols?: string) => ({
        eq: (_col: string, _val: unknown) => ({
          lt: (_col2: string, _val2: unknown) => ({
            limit: (_n: number) =>
              Promise.resolve({
                data: state.selectRows[table] ?? [],
                error: state.selectError[table] ?? null,
              }),
          }),
        }),
      }),
      // UPDATE chain: .update().eq().eq().select()
      update: (_vals: unknown) => ({
        eq: (_col: string, _val: unknown) => ({
          eq: (_col2: string, _val2: unknown) => ({
            select: (_cols?: string) =>
              Promise.resolve(
                state.updateResult[table] ?? { data: [], error: null }
              ),
          }),
        }),
      }),
      // INSERT chain (drift_alerts)
      insert: (_row: unknown) =>
        Promise.resolve({ error: state.insertError ?? null }),
    }),
  };
}

// ── env helpers ──────────────────────────────────────────────────

const PLATFORM_KEY = "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7";

function withPlatformKey(fn: () => Promise<void>) {
  return async () => {
    const orig = process.env.DESO_PLATFORM_PUBLIC_KEY;
    process.env.DESO_PLATFORM_PUBLIC_KEY = PLATFORM_KEY;
    try {
      await fn();
    } finally {
      process.env.DESO_PLATFORM_PUBLIC_KEY = orig;
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ════════════════════════════════════════════════════════════════
// mapVerifyOutcome — pure unit tests (no mocks)
// ════════════════════════════════════════════════════════════════

describe("mapVerifyOutcome", () => {
  it("ok:true + blockHashHex set → mark_claimed INFO", () => {
    const result = mapVerifyOutcome({
      ok: true,
      blockHashHex: "abc123",
      actualAmountNanos: 1000,
    });
    expect(result).toEqual({ kind: "mark_claimed", severity: "INFO" });
  });

  it("ok:true + blockHashHex null → leave_pending_chain_pending INFO", () => {
    const result = mapVerifyOutcome({
      ok: true,
      blockHashHex: null,
      actualAmountNanos: 1000,
    });
    expect(result).toEqual({
      kind: "leave_pending_chain_pending",
      severity: "INFO",
    });
  });

  it("ok:false reason tx-not-found → mark_failed WARN", () => {
    const result = mapVerifyOutcome({ ok: false, reason: "tx-not-found" });
    expect(result).toEqual({
      kind: "mark_failed",
      reason: "reconciliation: tx not found on chain",
      severity: "WARN",
    });
  });

  it("ok:false reason deso-api-unreachable → leave_pending_api_down WARN", () => {
    const result = mapVerifyOutcome({
      ok: false,
      reason: "deso-api-unreachable",
    });
    expect(result).toEqual({
      kind: "leave_pending_api_down",
      severity: "WARN",
    });
  });

  it("ok:false reason sender-mismatch → drift_critical", () => {
    const result = mapVerifyOutcome({
      ok: false,
      reason: "sender-mismatch",
      detail: "expected X got Y",
    });
    expect(result.kind).toBe("drift_critical");
  });

  it("ok:false reason recipient-not-found → drift_critical", () => {
    const result = mapVerifyOutcome({
      ok: false,
      reason: "recipient-not-found",
    });
    expect(result.kind).toBe("drift_critical");
  });

  it("ok:false reason amount-too-low → drift_critical", () => {
    const result = mapVerifyOutcome({ ok: false, reason: "amount-too-low" });
    expect(result.kind).toBe("drift_critical");
  });

  it("ok:false reason tx-not-basic-transfer → drift_critical", () => {
    const result = mapVerifyOutcome({
      ok: false,
      reason: "tx-not-basic-transfer",
    });
    expect(result.kind).toBe("drift_critical");
  });

  it("ok:false reason invalid-hex → drift_critical", () => {
    const result = mapVerifyOutcome({ ok: false, reason: "invalid-hex" });
    expect(result.kind).toBe("drift_critical");
  });

  it("ok:false reason invalid-encoding → drift_critical", () => {
    const result = mapVerifyOutcome({
      ok: false,
      reason: "invalid-encoding",
    });
    expect(result.kind).toBe("drift_critical");
  });
});

// ════════════════════════════════════════════════════════════════
// sweepPositionPayouts
// ════════════════════════════════════════════════════════════════

describe("sweepPositionPayouts", () => {
  it(
    "returns errors:1 when DESO_PLATFORM_PUBLIC_KEY is missing",
    async () => {
      const orig = process.env.DESO_PLATFORM_PUBLIC_KEY;
      delete process.env.DESO_PLATFORM_PUBLIC_KEY;
      const state: MockState = {
        selectRows: {},
        selectError: {},
        updateResult: {},
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepPositionPayouts(supabase as any, {
        triggeredBy: "manual",
      });
      expect(result.errors).toBe(1);
      expect(result.swept).toBe(0);
      process.env.DESO_PLATFORM_PUBLIC_KEY = orig;
    }
  );

  it(
    "returns zeroed result when no stale rows",
    withPlatformKey(async () => {
      const state: MockState = {
        selectRows: { position_payouts: [] },
        selectError: {},
        updateResult: {},
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepPositionPayouts(supabase as any);
      expect(result).toEqual({
        table: "position_payouts",
        swept: 0,
        confirmed: 0,
        failed: 0,
        stillPending: 0,
        driftAlerts: 0,
        errors: 0,
      });
    })
  );

  it(
    "confirmed++ when verifyTx returns ok:true + blockHashHex",
    withPlatformKey(async () => {
      mockVerify.mockResolvedValue({
        ok: true,
        blockHashHex: "deadbeef",
        actualAmountNanos: 5000,
      });
      const row = {
        id: "row-1",
        position_id: "pos-1",
        user_id: "user-1",
        payout_amount_nanos: "5000",
        claim_tx_hash: "aabbcc",
        claim_status: "in_flight",
        users: { deso_public_key: "BC1YLrecipient" },
      };
      const state: MockState = {
        selectRows: { position_payouts: [row] },
        selectError: {},
        updateResult: {
          position_payouts: { data: [{ id: "row-1" }], error: null },
        },
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepPositionPayouts(supabase as any, {
        triggeredBy: "cron",
      });
      expect(result.swept).toBe(1);
      expect(result.confirmed).toBe(1);
      expect(result.failed).toBe(0);
    })
  );

  it(
    "failed++ when verifyTx returns tx-not-found",
    withPlatformKey(async () => {
      mockVerify.mockResolvedValue({ ok: false, reason: "tx-not-found" });
      const row = {
        id: "row-2",
        position_id: "pos-2",
        user_id: "user-2",
        payout_amount_nanos: "3000",
        claim_tx_hash: "ccddee",
        claim_status: "in_flight",
        users: { deso_public_key: "BC1YLrecipient2" },
      };
      const state: MockState = {
        selectRows: { position_payouts: [row] },
        selectError: {},
        updateResult: {
          position_payouts: { data: [{ id: "row-2" }], error: null },
        },
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepPositionPayouts(supabase as any, {
        triggeredBy: "cron",
      });
      expect(result.swept).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.confirmed).toBe(0);
    })
  );

  it(
    "stillPending++ when verifyTx returns deso-api-unreachable",
    withPlatformKey(async () => {
      mockVerify.mockResolvedValue({
        ok: false,
        reason: "deso-api-unreachable",
      });
      const row = {
        id: "row-3",
        position_id: "pos-3",
        user_id: "user-3",
        payout_amount_nanos: "2000",
        claim_tx_hash: "eeff00",
        claim_status: "in_flight",
        users: { deso_public_key: "BC1YLrecipient3" },
      };
      const state: MockState = {
        selectRows: { position_payouts: [row] },
        selectError: {},
        updateResult: {},
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepPositionPayouts(supabase as any);
      expect(result.swept).toBe(1);
      expect(result.stillPending).toBe(1);
      expect(result.confirmed).toBe(0);
      expect(result.failed).toBe(0);
    })
  );

  it(
    "driftAlerts++ when verifyTx returns sender-mismatch (CRITICAL)",
    withPlatformKey(async () => {
      mockVerify.mockResolvedValue({
        ok: false,
        reason: "sender-mismatch",
        detail: "expected platform got other",
      });
      const row = {
        id: "row-4",
        position_id: "pos-4",
        user_id: "user-4",
        payout_amount_nanos: "4000",
        claim_tx_hash: "112233",
        claim_status: "in_flight",
        users: { deso_public_key: "BC1YLrecipient4" },
      };
      const state: MockState = {
        selectRows: { position_payouts: [row] },
        selectError: {},
        updateResult: {},
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepPositionPayouts(supabase as any);
      expect(result.swept).toBe(1);
      expect(result.driftAlerts).toBe(1);
      expect(result.confirmed).toBe(0);
      expect(result.failed).toBe(0);
    })
  );

  it(
    "driftAlerts++ and no verifyTx call when claim_tx_hash is null",
    withPlatformKey(async () => {
      const row = {
        id: "row-5",
        position_id: "pos-5",
        user_id: "user-5",
        payout_amount_nanos: "1000",
        claim_tx_hash: null,
        claim_status: "in_flight",
        users: { deso_public_key: "BC1YLrecipient5" },
      };
      const state: MockState = {
        selectRows: { position_payouts: [row] },
        selectError: {},
        updateResult: {},
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepPositionPayouts(supabase as any);
      expect(result.driftAlerts).toBe(1);
      expect(mockVerify).not.toHaveBeenCalled();
    })
  );

  it(
    "confirmed stays 0 when UPDATE returns 0 rows (concurrent sweep)",
    withPlatformKey(async () => {
      mockVerify.mockResolvedValue({
        ok: true,
        blockHashHex: "deadbeef",
        actualAmountNanos: 5000,
      });
      const row = {
        id: "row-6",
        position_id: "pos-6",
        user_id: "user-6",
        payout_amount_nanos: "5000",
        claim_tx_hash: "aabbcc",
        claim_status: "in_flight",
        users: { deso_public_key: "BC1YLrecipient6" },
      };
      const state: MockState = {
        selectRows: { position_payouts: [row] },
        selectError: {},
        updateResult: {
          // 0 rows → concurrent sweep beat us
          position_payouts: { data: [], error: null },
        },
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepPositionPayouts(supabase as any);
      expect(result.confirmed).toBe(0);
      expect(result.errors).toBe(0);
    })
  );

  it(
    "respects custom staleMinutes and limit options",
    withPlatformKey(async () => {
      const state: MockState = {
        selectRows: { position_payouts: [] },
        selectError: {},
        updateResult: {},
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepPositionPayouts(supabase as any, {
        staleMinutes: 30,
        limit: 10,
        triggeredBy: "admin",
      });
      expect(result.table).toBe("position_payouts");
      expect(result.errors).toBe(0);
    })
  );

  it(
    "filters out rows where users join is null",
    withPlatformKey(async () => {
      mockVerify.mockResolvedValue({
        ok: true,
        blockHashHex: "deadbeef",
        actualAmountNanos: 5000,
      });
      const rowWithNullUser = {
        id: "row-7",
        position_id: "pos-7",
        user_id: "user-7",
        payout_amount_nanos: "5000",
        claim_tx_hash: "aabbcc",
        claim_status: "in_flight",
        users: null, // JOIN returned null
      };
      const state: MockState = {
        selectRows: { position_payouts: [rowWithNullUser] },
        selectError: {},
        updateResult: {},
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepPositionPayouts(supabase as any);
      // Row filtered out before processing — swept stays 0
      expect(result.swept).toBe(0);
      expect(mockVerify).not.toHaveBeenCalled();
    })
  );
});

// ════════════════════════════════════════════════════════════════
// sweepCreatorClaimPayouts
// ════════════════════════════════════════════════════════════════

describe("sweepCreatorClaimPayouts", () => {
  it(
    "returns errors:1 when DESO_PLATFORM_PUBLIC_KEY is missing",
    async () => {
      const orig = process.env.DESO_PLATFORM_PUBLIC_KEY;
      delete process.env.DESO_PLATFORM_PUBLIC_KEY;
      const state: MockState = {
        selectRows: {},
        selectError: {},
        updateResult: {},
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepCreatorClaimPayouts(supabase as any, {
        triggeredBy: "manual",
      });
      expect(result.errors).toBe(1);
      expect(result.table).toBe("creator_claim_payouts");
      process.env.DESO_PLATFORM_PUBLIC_KEY = orig;
    }
  );

  it(
    "confirmed++ uses status='claimed' for creator_claim_payouts",
    withPlatformKey(async () => {
      mockVerify.mockResolvedValue({
        ok: true,
        blockHashHex: "cafebabe",
        actualAmountNanos: 8000,
      });
      const row = {
        id: "ccp-1",
        creator_id: "creator-1",
        amount_nanos: "8000",
        tx_hash: "txhash1",
        status: "in_flight",
        created_at: new Date(Date.now() - 30 * 60_000).toISOString(),
        creators: { deso_public_key: "BC1YLcreator1" },
      };
      const state: MockState = {
        selectRows: { creator_claim_payouts: [row] },
        selectError: {},
        updateResult: {
          creator_claim_payouts: { data: [{ id: "ccp-1" }], error: null },
        },
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepCreatorClaimPayouts(supabase as any, {
        triggeredBy: "cron",
      });
      expect(result.swept).toBe(1);
      expect(result.confirmed).toBe(1);
      expect(result.table).toBe("creator_claim_payouts");
    })
  );

  it(
    "failed++ when verifyTx returns tx-not-found (uses error_reason column)",
    withPlatformKey(async () => {
      mockVerify.mockResolvedValue({ ok: false, reason: "tx-not-found" });
      const row = {
        id: "ccp-2",
        creator_id: "creator-2",
        amount_nanos: "6000",
        tx_hash: "txhash2",
        status: "in_flight",
        created_at: new Date(Date.now() - 20 * 60_000).toISOString(),
        creators: { deso_public_key: "BC1YLcreator2" },
      };
      const state: MockState = {
        selectRows: { creator_claim_payouts: [row] },
        selectError: {},
        updateResult: {
          creator_claim_payouts: { data: [{ id: "ccp-2" }], error: null },
        },
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepCreatorClaimPayouts(supabase as any, {
        triggeredBy: "cron",
      });
      expect(result.swept).toBe(1);
      expect(result.failed).toBe(1);
    })
  );

  it(
    "filters out rows where creators join is null",
    withPlatformKey(async () => {
      const row = {
        id: "ccp-3",
        creator_id: "creator-3",
        amount_nanos: "4000",
        tx_hash: "txhash3",
        status: "in_flight",
        created_at: new Date(Date.now() - 20 * 60_000).toISOString(),
        creators: null,
      };
      const state: MockState = {
        selectRows: { creator_claim_payouts: [row] },
        selectError: {},
        updateResult: {},
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepCreatorClaimPayouts(supabase as any);
      expect(result.swept).toBe(0);
      expect(mockVerify).not.toHaveBeenCalled();
    })
  );
});

// ════════════════════════════════════════════════════════════════
// mapCctVerifyOutcome — pure unit tests (no mocks)
// ════════════════════════════════════════════════════════════════

describe("mapCctVerifyOutcome", () => {
  it("ok:true + blockHashHex set → mark_claimed INFO", () => {
    const result = mapCctVerifyOutcome({
      ok: true,
      blockHashHex: "abc123",
      actualAmountNanos: 500,
    });
    expect(result).toEqual({ kind: "mark_claimed", severity: "INFO" });
  });

  it("ok:true + blockHashHex null → leave_pending_chain_pending INFO", () => {
    const result = mapCctVerifyOutcome({
      ok: true,
      blockHashHex: null,
      actualAmountNanos: 500,
    });
    expect(result).toEqual({
      kind: "leave_pending_chain_pending",
      severity: "INFO",
    });
  });

  it("ok:false reason tx-not-found → mark_failed WARN", () => {
    const result = mapCctVerifyOutcome({ ok: false, reason: "tx-not-found" });
    expect(result).toEqual({
      kind: "mark_failed",
      reason: "reconciliation: tx not found on chain",
      severity: "WARN",
    });
  });

  it("ok:false reason deso-api-unreachable → leave_pending_api_down WARN", () => {
    const result = mapCctVerifyOutcome({
      ok: false,
      reason: "deso-api-unreachable",
    });
    expect(result).toEqual({
      kind: "leave_pending_api_down",
      severity: "WARN",
    });
  });

  it("ok:false reason sender-mismatch → drift_critical", () => {
    const result = mapCctVerifyOutcome({
      ok: false,
      reason: "sender-mismatch",
      detail: "expected platform got other",
    });
    expect(result.kind).toBe("drift_critical");
  });

  it("ok:false reason recipient-not-found → drift_critical", () => {
    const result = mapCctVerifyOutcome({
      ok: false,
      reason: "recipient-not-found",
    });
    expect(result.kind).toBe("drift_critical");
  });

  it("ok:false reason creator-username-mismatch → drift_critical", () => {
    const result = mapCctVerifyOutcome({
      ok: false,
      reason: "creator-username-mismatch",
    });
    expect(result.kind).toBe("drift_critical");
  });

  it("ok:false reason amount-mismatch → drift_critical", () => {
    const result = mapCctVerifyOutcome({
      ok: false,
      reason: "amount-mismatch",
    });
    expect(result.kind).toBe("drift_critical");
  });

  it("ok:false reason tx-not-creator-coin-transfer → drift_critical", () => {
    const result = mapCctVerifyOutcome({
      ok: false,
      reason: "tx-not-creator-coin-transfer",
    });
    expect(result.kind).toBe("drift_critical");
  });
});

// ════════════════════════════════════════════════════════════════
// sweepHolderRewards
// ════════════════════════════════════════════════════════════════

describe("sweepHolderRewards", () => {
  beforeEach(() => {
    mockVerifyCct.mockReset();
  });

  it(
    "returns errors:1 when DESO_PLATFORM_PUBLIC_KEY is missing",
    async () => {
      const orig = process.env.DESO_PLATFORM_PUBLIC_KEY;
      delete process.env.DESO_PLATFORM_PUBLIC_KEY;
      const state: MockState = {
        selectRows: {},
        selectError: {},
        updateResult: {},
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepHolderRewards(supabase as any, {
        triggeredBy: "manual",
      });
      expect(result.errors).toBe(1);
      expect(result.swept).toBe(0);
      expect(result.table).toBe("holder_rewards");
      process.env.DESO_PLATFORM_PUBLIC_KEY = orig;
    }
  );

  it(
    "returns zeroed result when no stale rows",
    withPlatformKey(async () => {
      const state: MockState = {
        selectRows: { holder_rewards: [] },
        selectError: {},
        updateResult: {},
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepHolderRewards(supabase as any);
      expect(result).toEqual({
        table: "holder_rewards",
        swept: 0,
        confirmed: 0,
        failed: 0,
        stillPending: 0,
        driftAlerts: 0,
        errors: 0,
      });
    })
  );

  it(
    "confirmed++ when verifyCreatorCoinTransfer returns ok:true + blockHashHex",
    withPlatformKey(async () => {
      mockVerifyCct.mockResolvedValue({
        ok: true,
        blockHashHex: "deadbeef",
        actualAmountNanos: 455400,
      });
      const row = {
        id: "hr-1",
        holder_deso_public_key: "BC1YLholder1",
        token_slug: "calderasports",
        amount_creator_coin_nanos: "455400",
        claimed_tx_hash: "aabbcc",
        status: "in_flight",
      };
      const state: MockState = {
        selectRows: { holder_rewards: [row] },
        selectError: {},
        updateResult: {
          holder_rewards: { data: [{ id: "hr-1" }], error: null },
        },
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepHolderRewards(supabase as any, {
        triggeredBy: "cron",
      });
      expect(result.swept).toBe(1);
      expect(result.confirmed).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.table).toBe("holder_rewards");
    })
  );

  it(
    "failed++ when verifyCreatorCoinTransfer returns tx-not-found",
    withPlatformKey(async () => {
      mockVerifyCct.mockResolvedValue({ ok: false, reason: "tx-not-found" });
      const row = {
        id: "hr-2",
        holder_deso_public_key: "BC1YLholder2",
        token_slug: "calderamusic",
        amount_creator_coin_nanos: "200000",
        claimed_tx_hash: "ccddee",
        status: "in_flight",
      };
      const state: MockState = {
        selectRows: { holder_rewards: [row] },
        selectError: {},
        updateResult: {
          holder_rewards: { data: [{ id: "hr-2" }], error: null },
        },
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepHolderRewards(supabase as any, {
        triggeredBy: "cron",
      });
      expect(result.swept).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.confirmed).toBe(0);
    })
  );

  it(
    "stillPending++ when verifyCreatorCoinTransfer returns deso-api-unreachable",
    withPlatformKey(async () => {
      mockVerifyCct.mockResolvedValue({
        ok: false,
        reason: "deso-api-unreachable",
      });
      const row = {
        id: "hr-3",
        holder_deso_public_key: "BC1YLholder3",
        token_slug: "calderatech",
        amount_creator_coin_nanos: "100000",
        claimed_tx_hash: "eeff00",
        status: "in_flight",
      };
      const state: MockState = {
        selectRows: { holder_rewards: [row] },
        selectError: {},
        updateResult: {},
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepHolderRewards(supabase as any);
      expect(result.swept).toBe(1);
      expect(result.stillPending).toBe(1);
      expect(result.confirmed).toBe(0);
      expect(result.failed).toBe(0);
    })
  );

  it(
    "driftAlerts++ when verifyCreatorCoinTransfer returns sender-mismatch (CRITICAL)",
    withPlatformKey(async () => {
      mockVerifyCct.mockResolvedValue({
        ok: false,
        reason: "sender-mismatch",
        detail: "expected platform got other",
      });
      const row = {
        id: "hr-4",
        holder_deso_public_key: "BC1YLholder4",
        token_slug: "calderasports",
        amount_creator_coin_nanos: "300000",
        claimed_tx_hash: "112233",
        status: "in_flight",
      };
      const state: MockState = {
        selectRows: { holder_rewards: [row] },
        selectError: {},
        updateResult: {},
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepHolderRewards(supabase as any);
      expect(result.swept).toBe(1);
      expect(result.driftAlerts).toBe(1);
      expect(result.confirmed).toBe(0);
      expect(result.failed).toBe(0);
    })
  );

  it(
    "driftAlerts++ and no verifyCreatorCoinTransfer call when claimed_tx_hash is null",
    withPlatformKey(async () => {
      const row = {
        id: "hr-5",
        holder_deso_public_key: "BC1YLholder5",
        token_slug: "calderamusic",
        amount_creator_coin_nanos: "50000",
        claimed_tx_hash: null,
        status: "in_flight",
      };
      const state: MockState = {
        selectRows: { holder_rewards: [row] },
        selectError: {},
        updateResult: {},
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepHolderRewards(supabase as any);
      expect(result.driftAlerts).toBe(1);
      expect(mockVerifyCct).not.toHaveBeenCalled();
    })
  );

  it(
    "confirmed stays 0 when UPDATE returns 0 rows (concurrent sweep)",
    withPlatformKey(async () => {
      mockVerifyCct.mockResolvedValue({
        ok: true,
        blockHashHex: "deadbeef",
        actualAmountNanos: 455400,
      });
      const row = {
        id: "hr-6",
        holder_deso_public_key: "BC1YLholder6",
        token_slug: "calderasports",
        amount_creator_coin_nanos: "455400",
        claimed_tx_hash: "aabbcc",
        status: "in_flight",
      };
      const state: MockState = {
        selectRows: { holder_rewards: [row] },
        selectError: {},
        updateResult: {
          // 0 rows → concurrent sweep beat us
          holder_rewards: { data: [], error: null },
        },
        insertError: null,
      };
      const supabase = makeSupabaseMock(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sweepHolderRewards(supabase as any);
      expect(result.confirmed).toBe(0);
      expect(result.errors).toBe(0);
    })
  );
});
