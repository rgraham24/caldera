import { describe, it, expect, vi } from "vitest";
import { resolveMarket } from "@/lib/markets/resolution";

const MARKET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeSupabaseStub(
  rpcReturn:
    | { data: unknown; error: null }
    | { data: null; error: { message: string; code?: string } }
) {
  return {
    rpc: vi.fn().mockResolvedValue(rpcReturn),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("resolveMarket", () => {
  it("returns ok=true with parsed counts on RPC success", async () => {
    const supabase = makeSupabaseStub({
      data: {
        positions_settled: 5,
        winners_count: 3,
        total_payout_usd: 12.5,
      },
      error: null,
    });

    const result = await resolveMarket(supabase, {
      marketId: MARKET_ID,
      outcome: "yes",
      resolutionNote: "TEST_RESOLVED",
      sourceUrl: "https://example.com",
      resolvedByUserId: USER_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok=true");
    expect(result.positionsSettled).toBe(5);
    expect(result.winnersCount).toBe(3);
    expect(result.totalPayoutUsd).toBe(12.5);
  });

  it("coerces numeric strings from Postgres into numbers", async () => {
    // Postgres NUMERIC can return as string in some serialization paths
    const supabase = makeSupabaseStub({
      data: {
        positions_settled: "10",
        winners_count: "4",
        total_payout_usd: "25.50",
      },
      error: null,
    });

    const result = await resolveMarket(supabase, {
      marketId: MARKET_ID,
      outcome: "no",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok=true");
    expect(result.positionsSettled).toBe(10);
    expect(result.winnersCount).toBe(4);
    expect(result.totalPayoutUsd).toBe(25.5);
  });

  it("returns reason='invalid-outcome' when RPC raises invalid-outcome", async () => {
    const supabase = makeSupabaseStub({
      data: null,
      error: { message: "invalid-outcome: maybe" },
    });

    const result = await resolveMarket(supabase, {
      marketId: MARKET_ID,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      outcome: "maybe" as any,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected ok=false");
    expect(result.reason).toBe("invalid-outcome");
    expect(result.detail).toContain("maybe");
  });

  it("returns reason='market-already-resolved-or-not-found' on duplicate resolve", async () => {
    const supabase = makeSupabaseStub({
      data: null,
      error: {
        message: `market-already-resolved-or-not-found: ${MARKET_ID}`,
      },
    });

    const result = await resolveMarket(supabase, {
      marketId: MARKET_ID,
      outcome: "yes",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected ok=false");
    expect(result.reason).toBe("market-already-resolved-or-not-found");
  });

  it("returns reason='rpc-error' for unrecognized RPC errors", async () => {
    const supabase = makeSupabaseStub({
      data: null,
      error: { message: "connection terminated unexpectedly" },
    });

    const result = await resolveMarket(supabase, {
      marketId: MARKET_ID,
      outcome: "yes",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected ok=false");
    expect(result.reason).toBe("rpc-error");
    expect(result.detail).toBe("connection terminated unexpectedly");
  });

  it("returns reason='rpc-error' when RPC returns null data with no error", async () => {
    const supabase = makeSupabaseStub({
      data: null,
      error: null,
    });

    const result = await resolveMarket(supabase, {
      marketId: MARKET_ID,
      outcome: "yes",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected ok=false");
    expect(result.reason).toBe("rpc-error");
    expect(result.detail).toContain("null data");
  });

  it("passes all 5 RPC parameters correctly", async () => {
    const supabase = makeSupabaseStub({
      data: {
        positions_settled: 0,
        winners_count: 0,
        total_payout_usd: 0,
      },
      error: null,
    });

    await resolveMarket(supabase, {
      marketId: MARKET_ID,
      outcome: "cancelled",
      resolvedByUserId: USER_ID,
      resolutionNote: "ADMIN_NOTE",
      sourceUrl: "https://espn.com/game/123",
    });

    expect(supabase.rpc).toHaveBeenCalledWith("atomic_resolve_market", {
      p_market_id: MARKET_ID,
      p_outcome: "cancelled",
      p_resolved_by_user_id: USER_ID,
      p_resolution_note: "ADMIN_NOTE",
      p_source_url: "https://espn.com/game/123",
    });
  });

  it("defaults optional params to null when not provided", async () => {
    const supabase = makeSupabaseStub({
      data: {
        positions_settled: 0,
        winners_count: 0,
        total_payout_usd: 0,
      },
      error: null,
    });

    await resolveMarket(supabase, {
      marketId: MARKET_ID,
      outcome: "yes",
    });

    expect(supabase.rpc).toHaveBeenCalledWith("atomic_resolve_market", {
      p_market_id: MARKET_ID,
      p_outcome: "yes",
      p_resolved_by_user_id: null,
      p_resolution_note: null,
      p_source_url: null,
    });
  });
});
