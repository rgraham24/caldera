import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/deso/api", () => ({
  getUserDesoBalance: vi.fn(),
  getCreatorCoinHoldings: vi.fn(),
}));

import { checkDesoSolvency, checkCreatorCoinSolvency } from "@/lib/deso/solvency";
import { getUserDesoBalance, getCreatorCoinHoldings } from "@/lib/deso/api";

const mockGetUserDesoBalance = getUserDesoBalance as ReturnType<typeof vi.fn>;
const mockGetCreatorCoinHoldings = getCreatorCoinHoldings as ReturnType<typeof vi.fn>;

const PK = "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7";
const CREATOR_PK = "BC1YLfvkMMiSKeSfCmXnfXLTFe3m9CwR4JNbdkCDhKMR2jGEHvtDZq";

const ONE_DESO = BigInt(1_000_000_000); // 1 DESO in nanos
const TWO_DESO = BigInt(2_000_000_000);
const HALF_DESO = BigInt(500_000_000);

beforeEach(() => {
  vi.resetAllMocks();
});

// ── checkDesoSolvency ────────────────────────────────────────────────────────

describe("checkDesoSolvency", () => {
  it("returns ok=true when balance >= required", async () => {
    mockGetUserDesoBalance.mockResolvedValue({ balanceNanos: 2_000_000_000, balanceUSD: 0 });
    const result = await checkDesoSolvency(PK, ONE_DESO);
    expect(result).toEqual({ ok: true, available: TWO_DESO });
  });

  it("returns ok=true when balance == required (boundary)", async () => {
    mockGetUserDesoBalance.mockResolvedValue({ balanceNanos: 1_000_000_000, balanceUSD: 0 });
    const result = await checkDesoSolvency(PK, ONE_DESO);
    expect(result).toEqual({ ok: true, available: ONE_DESO });
  });

  it("returns ok=true when requiredNanos is 0", async () => {
    mockGetUserDesoBalance.mockResolvedValue({ balanceNanos: 0, balanceUSD: 0 });
    const result = await checkDesoSolvency(PK, BigInt(0));
    expect(result).toEqual({ ok: true, available: BigInt(0) });
  });

  it("returns ok=false with reason=insufficient when balance < required", async () => {
    mockGetUserDesoBalance.mockResolvedValue({ balanceNanos: 500_000_000, balanceUSD: 0 });
    const result = await checkDesoSolvency(PK, ONE_DESO);
    expect(result).toMatchObject({
      ok: false,
      reason: "insufficient",
      required: ONE_DESO,
      available: HALF_DESO,
    });
  });

  it("returns ok=false with reason=fetch-failed when fetcher throws", async () => {
    mockGetUserDesoBalance.mockRejectedValue(new Error("network error"));
    const result = await checkDesoSolvency(PK, ONE_DESO);
    expect(result).toMatchObject({
      ok: false,
      reason: "fetch-failed",
      required: ONE_DESO,
    });
    expect((result as { detail?: string }).detail).toContain("network error");
  });

  it("returns ok=false with reason=fetch-failed when fetcher returns null", async () => {
    mockGetUserDesoBalance.mockResolvedValue(null);
    const result = await checkDesoSolvency(PK, ONE_DESO);
    expect(result).toMatchObject({ ok: false, reason: "fetch-failed" });
  });

  it("returns ok=false with reason=fetch-failed when balanceNanos is missing", async () => {
    mockGetUserDesoBalance.mockResolvedValue({ balanceUSD: 5 }); // no balanceNanos
    const result = await checkDesoSolvency(PK, ONE_DESO);
    expect(result).toMatchObject({ ok: false, reason: "fetch-failed" });
  });
});

// ── checkCreatorCoinSolvency ─────────────────────────────────────────────────

describe("checkCreatorCoinSolvency", () => {
  it("returns ok=true when creator coin balance >= required", async () => {
    mockGetCreatorCoinHoldings.mockResolvedValue({ balanceNanos: 5_000_000_000, balanceUSD: 0 });
    const result = await checkCreatorCoinSolvency(PK, CREATOR_PK, ONE_DESO);
    expect(result).toEqual({ ok: true, available: BigInt(5_000_000_000) });
  });

  it("returns ok=false with reason=insufficient when creator coin balance < required", async () => {
    mockGetCreatorCoinHoldings.mockResolvedValue({ balanceNanos: 100_000_000, balanceUSD: 0 });
    const result = await checkCreatorCoinSolvency(PK, CREATOR_PK, ONE_DESO);
    expect(result).toMatchObject({
      ok: false,
      reason: "insufficient",
      required: ONE_DESO,
      available: BigInt(100_000_000),
    });
  });

  it("returns ok=false when holder has no entry for creator (zero balance)", async () => {
    mockGetCreatorCoinHoldings.mockResolvedValue({ balanceNanos: 0, balanceUSD: 0 });
    const result = await checkCreatorCoinSolvency(PK, CREATOR_PK, ONE_DESO);
    expect(result).toMatchObject({ ok: false, reason: "insufficient", available: BigInt(0) });
  });

  it("returns ok=false with reason=fetch-failed when fetcher throws", async () => {
    mockGetCreatorCoinHoldings.mockRejectedValue(new Error("timeout"));
    const result = await checkCreatorCoinSolvency(PK, CREATOR_PK, ONE_DESO);
    expect(result).toMatchObject({ ok: false, reason: "fetch-failed", required: ONE_DESO });
    expect((result as { detail?: string }).detail).toContain("timeout");
  });

  it("returns ok=false with reason=fetch-failed when fetcher returns null", async () => {
    mockGetCreatorCoinHoldings.mockResolvedValue(null);
    const result = await checkCreatorCoinSolvency(PK, CREATOR_PK, ONE_DESO);
    expect(result).toMatchObject({ ok: false, reason: "fetch-failed" });
  });
});
