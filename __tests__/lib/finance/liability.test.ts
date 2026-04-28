/**
 * __tests__/lib/finance/liability.test.ts
 *
 * Unit tests for lib/finance/liability.ts
 * All 11 scenarios from Stream 2 Phase 1 design doc.
 *
 * No network calls — all fetchers injected via ComputeOptions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  computePlatformLiability,
  DEFAULT_OPERATIONAL_BUFFER_DESO_NANOS,
  type ComputeOptions,
} from '@/lib/finance/liability';

// ─── Constants ────────────────────────────────────────────────────────────────

const RATE = 5.0;              // USD/DESO (clean round number)
const BTC_PRICE_DESO = 2.0;    // DESO/coin
const BTC_PRICE_USD = BTC_PRICE_DESO * RATE; // 10.0 USD/coin

const PLATFORM_PUBKEY = 'BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7';
const DESO_BALANCE = BigInt(10_000_000_000); // 10 DESO
const BITCOIN_BALANCE = BigInt(2_000_000_000); // 2 bitcoin coins

// ─── Mock factory ─────────────────────────────────────────────────────────────

type MockTableData = {
  positions?: Array<{ quantity: number }>;
  position_payouts?: Array<{ payout_amount_nanos: number }>;
  creators?: Array<{ unclaimed_earnings_escrow: number }>;
  holder_rewards?: Array<{ token_slug: string; amount_usd: number }>;
};

/**
 * Minimal Supabase mock that handles:
 *   .from(table).select(cols).eq(col, val)      → { data, error }
 *   .from(table).select(cols).in(col, vals)      → { data, error }
 *   .from(table).select(cols).gt(col, val)       → { data, error }
 *
 * All chain methods are self-returning so any terminal call can be awaited.
 */
function makeSupabase(tables: MockTableData = {}) {
  const makeChain = (rows: unknown[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: Record<string, any> = {};
    const resolve = () =>
      Promise.resolve({ data: rows, error: null });
    q.select = () => q;
    q.eq    = () => q;
    q.in    = () => q;
    q.gt    = () => q;
    // Making the chain itself thenable means `await supabase.from(...).select(...).eq(...)` works.
    q.then  = (fn: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve().then(fn);
    return q;
  };

  return {
    from: (table: string) =>
      makeChain(tables[table as keyof MockTableData] ?? []),
  };
}

/** Base options that prevent any network calls. */
function baseOptions(overrides?: Partial<ComputeOptions>): ComputeOptions {
  return {
    fetchDesoUsdRate: () => Promise.resolve(RATE),
    fetchPlatformDesoBalance: () => Promise.resolve(DESO_BALANCE),
    fetchPlatformCoinBalances: () => Promise.resolve({ bitcoin: BITCOIN_BALANCE }),
    fetchCoinPriceDeso: () => Promise.resolve(BTC_PRICE_DESO),
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.DESO_PLATFORM_PUBLIC_KEY = PLATFORM_PUBKEY;
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('computePlatformLiability', () => {
  // 1 — empty state
  it('empty state: liability=0, extractable=balance−buffer, status=healthy', async () => {
    const snap = await computePlatformLiability(
      makeSupabase() as never,
      baseOptions()
    );

    expect(snap.liability.deso_nanos).toBe(BigInt(0));
    expect(snap.extractable.deso_nanos).toBe(
      DESO_BALANCE - BigInt(0) - DEFAULT_OPERATIONAL_BUFFER_DESO_NANOS
    );
    expect(snap.status.deso).toBe('healthy');
    expect(snap.warnings).toHaveLength(0);
  });

  // 2 — single open YES position, 1.0 share
  it('single open position (1 share) adds correct DESO liability', async () => {
    // 1 share × $1 = $1.00 → usdToDesoNanos(1.0, 5.0) = floor(1/5 * 1e9) = BigInt(200_000_000)
    const snap = await computePlatformLiability(
      makeSupabase({ positions: [{ quantity: 1 }] }) as never,
      baseOptions()
    );

    expect(snap.liability.deso_breakdown.open_position_worst_case_nanos).toBe(BigInt(200_000_000));
    expect(snap.liability.deso_breakdown.pending_position_payouts_nanos).toBe(BigInt(0));
    expect(snap.liability.deso_breakdown.creator_escrow_nanos).toBe(BigInt(0));
    expect(snap.liability.deso_nanos).toBe(BigInt(200_000_000));
  });

  // 3 — multiple positions across markets
  it('multiple open positions: sum is correct', async () => {
    // 3 + 2 = 5 shares × $1 = $5 → usdToDesoNanos(5.0, 5.0) = BigInt(1_000_000_000)
    const snap = await computePlatformLiability(
      makeSupabase({ positions: [{ quantity: 3 }, { quantity: 2 }] }) as never,
      baseOptions()
    );

    expect(snap.liability.deso_breakdown.open_position_worst_case_nanos).toBe(BigInt(1_000_000_000));
  });

  // 4 — pending position_payouts add to DESO liability
  it('pending position_payouts are included in DESO liability', async () => {
    const snap = await computePlatformLiability(
      makeSupabase({
        position_payouts: [{ payout_amount_nanos: 500_000_000 }],
      }) as never,
      baseOptions()
    );

    expect(snap.liability.deso_breakdown.pending_position_payouts_nanos).toBe(BigInt(500_000_000));
    expect(snap.liability.deso_nanos).toBe(BigInt(500_000_000));
  });

  // 5 — creator escrow adds to DESO liability
  it('creator escrow ($0.005 × 2 creators) adds to DESO liability', async () => {
    // 0.005 + 0.005 = $0.010 → usdToDesoNanos(0.01, 5.0) = floor(0.01/5 * 1e9) = BigInt(2_000_000)
    const snap = await computePlatformLiability(
      makeSupabase({
        creators: [
          { unclaimed_earnings_escrow: 0.005 },
          { unclaimed_earnings_escrow: 0.005 },
        ],
      }) as never,
      baseOptions()
    );

    expect(snap.liability.deso_breakdown.creator_escrow_nanos).toBe(BigInt(2_000_000));
    expect(snap.liability.deso_nanos).toBe(BigInt(2_000_000));
  });

  // 6 — pending holder_rewards on $bitcoin only
  it('pending holder_rewards on bitcoin: coin liability computed, others zero', async () => {
    // $10 owed in bitcoin, price=$10/coin → 1 coin = BigInt(1_000_000_000)
    const snap = await computePlatformLiability(
      makeSupabase({
        holder_rewards: [{ token_slug: 'bitcoin', amount_usd: 10.0 }],
      }) as never,
      baseOptions()
    );

    expect(snap.liability.creatorCoins['bitcoin']).toBeDefined();
    expect(snap.liability.creatorCoins['bitcoin'].nanos).toBe(BigInt(1_000_000_000));
    expect(snap.liability.creatorCoins['ethereum']).toBeUndefined();

    const bd = snap.liability.creatorCoins['bitcoin'].breakdown;
    expect(bd.pending_holder_rewards_usd).toBeCloseTo(10.0, 6);
    expect(bd.pending_holder_rewards_rows).toBe(1);
    expect(bd.current_coin_price_usd).toBeCloseTo(BTC_PRICE_USD, 6);
  });

  // 7 — pending holder_rewards on multiple coins
  it('pending holder_rewards on multiple coins: per-coin breakdown correct', async () => {
    // bitcoin: $10 → BigInt(1_000_000_000) coins
    // ethereum: $20 → BigInt(2_000_000_000) coins  (same price mock returned for both)
    const snap = await computePlatformLiability(
      makeSupabase({
        holder_rewards: [
          { token_slug: 'bitcoin', amount_usd: 10.0 },
          { token_slug: 'ethereum', amount_usd: 20.0 },
        ],
      }) as never,
      baseOptions()
    );

    expect(snap.liability.creatorCoins['bitcoin'].nanos).toBe(BigInt(1_000_000_000));
    expect(snap.liability.creatorCoins['ethereum'].nanos).toBe(BigInt(2_000_000_000));
    expect(snap.liability.creatorCoins['ethereum'].breakdown.pending_holder_rewards_rows).toBe(1);
  });

  // 8 — extractable negative → status=insolvent
  it('extractable negative: status=insolvent, warning not required (DESO case)', async () => {
    // Balance: 0.1 DESO, position: 1 share → liability = BigInt(200_000_000) > balance → insolvent
    const snap = await computePlatformLiability(
      makeSupabase({ positions: [{ quantity: 1 }] }) as never,
      baseOptions({
        fetchPlatformDesoBalance: () => Promise.resolve(BigInt(100_000_000)), // 0.1 DESO
      })
    );

    // extractable = 100M - 200M - 500M = -600M → insolvent
    expect(snap.extractable.deso_nanos).toBe(BigInt(-600_000_000));
    expect(snap.status.deso).toBe('insolvent');
  });

  // 9 — operational buffer is subtracted from extractable
  it('buffer subtracted: extractable = balance − liability − buffer', async () => {
    // Balance: 1.2 DESO, no liability, buffer: 0.5 DESO
    // extractable = BigInt(1_200_000_000) - BigInt(0) - BigInt(500_000_000) = BigInt(700_000_000) → healthy
    const snap = await computePlatformLiability(
      makeSupabase() as never,
      baseOptions({
        fetchPlatformDesoBalance: () => Promise.resolve(BigInt(1_200_000_000)),
      })
    );

    expect(snap.extractable.deso_nanos).toBe(BigInt(700_000_000));
    expect(snap.status.deso).toBe('healthy');
  });

  // 10 — USD→DESO uses the passed-in rate
  it('USD→DESO conversion uses the injected desoUsdRate', async () => {
    // Rate: 10 USD/DESO (not the default 5)
    // 1 share × $1 → usdToDesoNanos(1.0, 10.0) = floor(1/10 * 1e9) = BigInt(100_000_000)
    const snap = await computePlatformLiability(
      makeSupabase({ positions: [{ quantity: 1 }] }) as never,
      baseOptions({
        fetchDesoUsdRate: () => Promise.resolve(10.0),
      })
    );

    expect(snap.liability.deso_breakdown.open_position_worst_case_nanos).toBe(BigInt(100_000_000));
    expect(snap.desoUsdRate).toBe(10.0);
  });

  // 11 — USD→coin uses the passed-in coin price
  it('USD→coin conversion uses the injected coin price (DESO/coin)', async () => {
    // Price: 4 DESO/coin, rate: 5 USD/DESO → coinPriceUsd = 20.0
    // $20 owed → floor(20/20 * 1e9) = BigInt(1_000_000_000)
    const snap = await computePlatformLiability(
      makeSupabase({
        holder_rewards: [{ token_slug: 'bitcoin', amount_usd: 20.0 }],
      }) as never,
      baseOptions({
        fetchCoinPriceDeso: () => Promise.resolve(4.0),
      })
    );

    const bd = snap.liability.creatorCoins['bitcoin'].breakdown;
    expect(bd.current_coin_price_usd).toBeCloseTo(20.0, 6); // 4 * 5 = 20
    expect(snap.liability.creatorCoins['bitcoin'].nanos).toBe(BigInt(1_000_000_000));
  });

  // Bonus — price fetch failure → status=unknown, warning emitted
  it('coin price fetch failure → status=unknown, warning added', async () => {
    const snap = await computePlatformLiability(
      makeSupabase({
        holder_rewards: [{ token_slug: 'unknowncoin', amount_usd: 5.0 }],
      }) as never,
      baseOptions({
        fetchCoinPriceDeso: () => Promise.resolve(null),
      })
    );

    expect(snap.status.creatorCoins['unknowncoin']).toBe('unknown');
    expect(snap.warnings.length).toBeGreaterThan(0);
    expect(snap.warnings[0]).toContain('unknowncoin');
    expect(snap.liability.creatorCoins['unknowncoin'].breakdown.current_coin_price_usd).toBeNull();
  });

  // Bonus — tight status when 0 < extractable < buffer
  it('tight status when extractable is between 0 and buffer', async () => {
    // Balance: 0.7 DESO (700M), liability: 0, buffer: 500M
    // extractable = 200M → 0 < 200M < 500M → tight
    const snap = await computePlatformLiability(
      makeSupabase() as never,
      baseOptions({
        fetchPlatformDesoBalance: () => Promise.resolve(BigInt(700_000_000)),
      })
    );

    expect(snap.extractable.deso_nanos).toBe(BigInt(200_000_000));
    expect(snap.status.deso).toBe('tight');
  });
});
