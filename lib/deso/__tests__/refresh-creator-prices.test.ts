import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// In-memory state for the supabase mock.
type CreatorRow = {
  slug: string;
  deso_username: string | null;
  deso_public_key: string | null;
  creator_coin_price: number | null;
  creator_coin_holders: number | null;
  coin_data_updated_at: string | null;
};
const mockState: {
  creators: CreatorRow[];
  updates: Array<{ slug: string; payload: Record<string, unknown> }>;
} = { creators: [], updates: [] };

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: (_table: string) => ({
      select: (_cols: string) => ({
        in: (_col: string, slugs: string[]) =>
          Promise.resolve({
            data: mockState.creators.filter((c) => slugs.includes(c.slug)),
            error: null,
          }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: (_col: string, slug: string) => {
          mockState.updates.push({ slug, payload });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

vi.mock("@/lib/deso/api", () => ({
  getDesoPrice: vi.fn().mockResolvedValue(4.63),
}));

import { refreshCreatorCoinPrices } from "@/lib/deso/refresh-creator-prices";

beforeEach(() => {
  mockState.creators = [];
  mockState.updates = [];
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("refreshCreatorCoinPrices", () => {
  it("returns empty map and never calls DeSo for empty input", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const result = await refreshCreatorCoinPrices([]);
    expect(result.size).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("writes fresh price+holders to DB and returns map on successful DeSo response", async () => {
    mockState.creators = [
      {
        slug: "loganpaul",
        deso_username: "loganpaul",
        deso_public_key: "BC1YL...",
        creator_coin_price: 0.30,
        creator_coin_holders: 100,
        coin_data_updated_at: "2026-01-01T00:00:00Z",
      },
    ];

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          Profile: {
            CoinPriceDeSoNanos: 90_000_000, // 0.09 DeSo
            CoinEntry: { NumberOfHolders: 250 },
          },
        }),
        { status: 200 }
      )
    );

    const result = await refreshCreatorCoinPrices(["loganpaul"]);

    expect(result.size).toBe(1);
    const fresh = result.get("loganpaul");
    expect(fresh).toBeTruthy();
    // 0.09 DeSo * 4.63 USD/DeSo = 0.4167 USD
    expect(fresh!.price).toBeCloseTo(0.09 * 4.63, 6);
    expect(fresh!.holders).toBe(250);
    expect(fresh!.updated_at).not.toBe("2026-01-01T00:00:00Z");

    expect(mockState.updates).toHaveLength(1);
    expect(mockState.updates[0].slug).toBe("loganpaul");
    expect(mockState.updates[0].payload.creator_coin_holders).toBe(250);
    expect(mockState.updates[0].payload.creator_coin_price).toBeCloseTo(
      0.09 * 4.63,
      6
    );
  });

  it("returns DB-fallback map on network failure (no DB writeback)", async () => {
    mockState.creators = [
      {
        slug: "drake",
        deso_username: "drake",
        deso_public_key: "BC1YL...",
        creator_coin_price: 1.23,
        creator_coin_holders: 42,
        coin_data_updated_at: "2026-04-30T12:00:00Z",
      },
    ];

    vi.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await refreshCreatorCoinPrices(["drake"]);

    expect(result.size).toBe(1);
    const stale = result.get("drake")!;
    expect(stale.price).toBe(1.23);
    expect(stale.holders).toBe(42);
    expect(stale.updated_at).toBe("2026-04-30T12:00:00Z");
    expect(mockState.updates).toHaveLength(0);
  });

  it("returns DB-fallback when DeSo request times out", async () => {
    mockState.creators = [
      {
        slug: "elonmusk",
        deso_username: "elonmusk",
        deso_public_key: "BC1YL...",
        creator_coin_price: 5.5,
        creator_coin_holders: 999,
        coin_data_updated_at: "2026-04-29T08:00:00Z",
      },
    ];

    // Simulate AbortError from the controller — fetch rejects with name=AbortError
    vi.spyOn(global, "fetch").mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        })
    );

    const result = await refreshCreatorCoinPrices(["elonmusk"]);

    expect(result.size).toBe(1);
    const stale = result.get("elonmusk")!;
    expect(stale.price).toBe(5.5);
    expect(stale.holders).toBe(999);
    expect(stale.updated_at).toBe("2026-04-29T08:00:00Z");
    expect(mockState.updates).toHaveLength(0);
  }, 5000);
});
