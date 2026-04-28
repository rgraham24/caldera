/**
 * lib/finance/liability.ts
 *
 * Platform treasury liability and solvency computation.
 * Answers: how much of the platform wallet is earned revenue vs. owed to users?
 *
 * Stream 2 Phase 1 — backend math only. Read-only.
 *
 * DESO liability = open_position_worst_case + pending_payouts + creator_escrow
 * Coin liability  = Σ pending_holder_rewards_usd / (price_deso × deso_usd_rate)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchDesoUsdRate as _sdkFetchRate, usdToDesoNanos } from '@/lib/deso/rate';
import { getUserDesoBalance, getCreatorProfile } from '@/lib/deso/api';

const DESO_API = 'https://api.deso.org/api/v0';

// ─── Exported types ───────────────────────────────────────────────────────────

export type AssetStatus = 'healthy' | 'tight' | 'insolvent' | 'unknown';
// 'unknown' — price fetch failed for this coin; liability uncomputable

export interface DesoBreakdown {
  open_position_worst_case_nanos: bigint;
  pending_position_payouts_nanos: bigint;
  creator_escrow_nanos: bigint;
}

export interface CoinBreakdown {
  pending_holder_rewards_usd: number;   // total USD owed for this coin
  pending_holder_rewards_rows: number;  // number of pending rows
  current_coin_price_usd: number | null; // null when price fetch failed
}

export interface TreasurySnapshot {
  asOf: string;           // ISO timestamp
  desoUsdRate: number;    // USD per DESO (snapshot)

  walletBalances: {
    deso_nanos: bigint;
    creatorCoins: Record<string, bigint>;   // slug → coin nanos
  };

  liability: {
    deso_nanos: bigint;
    deso_breakdown: DesoBreakdown;
    creatorCoins: Record<string, {
      nanos: bigint;
      breakdown: CoinBreakdown;
    }>;
  };

  extractable: {
    deso_nanos: bigint;                    // can be negative
    creatorCoins: Record<string, bigint>;  // can be negative
  };

  status: {
    deso: AssetStatus;
    creatorCoins: Record<string, AssetStatus>;
  };

  warnings: string[];
}

/**
 * Options for computePlatformLiability.
 * All fetchers are injectable for testability; defaults hit live DeSo node.
 */
export interface ComputeOptions {
  /** Override the DESO operational buffer (default: BigInt(500_000_000) = 0.5 DESO). */
  operationalBufferDesoNanos?: bigint;

  /** Override DESO/USD rate source. */
  fetchDesoUsdRate?: () => Promise<number | null>;

  /** Override platform DESO balance source. Returns bigint nanos. */
  fetchPlatformDesoBalance?: (pubkey: string) => Promise<bigint>;

  /**
   * Override platform creator-coin balances source.
   * Returns slug (lowercase username) → balance in nanos.
   */
  fetchPlatformCoinBalances?: (pubkey: string) => Promise<Record<string, bigint>>;

  /**
   * Override coin price source.
   * Returns DESO per coin (bonding-curve price), NOT USD.
   * Caller must multiply by desoUsdRate to get USD/coin.
   */
  fetchCoinPriceDeso?: (slug: string) => Promise<number | null>;
}

export const DEFAULT_OPERATIONAL_BUFFER_DESO_NANOS = BigInt(500_000_000); // 0.5 DESO
export const DEFAULT_OPERATIONAL_BUFFER_COIN_NANOS = BigInt(0);

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Convert USD to creator coin nanos at the given USD/coin price.
 * Returns BigInt(0) on invalid input (price fetch failures are handled upstream).
 */
function usdToCoinNanos(usd: number, coinPriceUsd: number): bigint {
  if (!Number.isFinite(coinPriceUsd) || coinPriceUsd <= 0) return BigInt(0);
  if (!Number.isFinite(usd) || usd <= 0) return BigInt(0);
  return BigInt(Math.floor((usd / coinPriceUsd) * 1e9));
}

/**
 * Classify solvency status for a single asset.
 *
 * healthy  — extractable >= buffer  (buffer=0 → healthy when extractable > 0)
 * tight    — 0 < extractable < buffer  (unreachable when buffer=0)
 * insolvent — extractable <= 0
 */
function classifyStatus(extractable: bigint, buffer: bigint): AssetStatus {
  if (extractable <= BigInt(0)) return 'insolvent';
  if (extractable < buffer) return 'tight';
  return 'healthy';
}

// ─── Default fetcher implementations ─────────────────────────────────────────

async function _defaultFetchDesoBalance(pubkey: string): Promise<bigint> {
  const { balanceNanos } = await getUserDesoBalance(pubkey);
  return BigInt(Math.floor(balanceNanos));
}

/**
 * Fetch all creator coins the platform wallet currently holds.
 * Uses get-users-stateless → UserList[0].UsersYouHODL.
 * Returns { slug (lowercase username) → BalanceNanos as bigint }.
 */
async function _defaultFetchCoinBalances(pubkey: string): Promise<Record<string, bigint>> {
  try {
    const res = await fetch(`${DESO_API}/get-users-stateless`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        PublicKeysBase58Check: [pubkey],
        SkipForLeaderboard: false,
        IncludeBalance: true,
      }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    const hodlings: Array<{
      BalanceNanos: number;
      ProfileEntryResponse?: { Username?: string };
    }> = data?.UserList?.[0]?.UsersYouHODL ?? [];

    const result: Record<string, bigint> = {};
    for (const h of hodlings) {
      const username = h.ProfileEntryResponse?.Username;
      if (username && h.BalanceNanos > 0) {
        result[username.toLowerCase()] = BigInt(h.BalanceNanos);
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Fetch the bonding-curve price of a creator coin in DESO per coin.
 * CoinPriceDeSoNanos is in nanos → divide by 1e9 to get DESO/coin.
 * Multiply by desoUsdRate to get USD/coin.
 */
async function _defaultFetchCoinPriceDeso(slug: string): Promise<number | null> {
  try {
    const profile = await getCreatorProfile(slug);
    if (!profile) return null;
    const priceDeso = (profile.CoinPriceDeSoNanos ?? 0) / 1e9;
    return priceDeso > 0 ? priceDeso : null;
  } catch {
    return null;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Compute a complete treasury snapshot for the platform wallet.
 *
 * Non-fatal on per-coin price failures: marks that asset as 'unknown'
 * and adds a warning, but still returns results for all other assets.
 *
 * Throws on fatal errors: missing env var, failed DESO/USD rate fetch,
 * or failed Supabase query.
 */
export async function computePlatformLiability(
  supabase: SupabaseClient,
  options?: ComputeOptions
): Promise<TreasurySnapshot> {
  // 1. Platform pubkey
  const pubkey = process.env.DESO_PLATFORM_PUBLIC_KEY;
  if (!pubkey) {
    throw new Error('[computePlatformLiability] DESO_PLATFORM_PUBLIC_KEY not set');
  }

  // 2. Resolve fetchers
  const bufferDesoNanos =
    options?.operationalBufferDesoNanos ?? DEFAULT_OPERATIONAL_BUFFER_DESO_NANOS;
  const getRateFn = options?.fetchDesoUsdRate ?? _sdkFetchRate;
  const getDesoBalFn = options?.fetchPlatformDesoBalance ?? _defaultFetchDesoBalance;
  const getCoinBalFn = options?.fetchPlatformCoinBalances ?? _defaultFetchCoinBalances;
  const getCoinPriceFn = options?.fetchCoinPriceDeso ?? _defaultFetchCoinPriceDeso;

  // 3. DESO/USD rate (required — throw on failure)
  const desoUsdRate = await getRateFn();
  if (desoUsdRate === null) {
    throw new Error('[computePlatformLiability] Failed to fetch DESO/USD rate');
  }

  // 4. Wallet balances (parallel)
  const [desoBalanceNanos, coinBalances] = await Promise.all([
    getDesoBalFn(pubkey),
    getCoinBalFn(pubkey),
  ]);

  const warnings: string[] = [];

  // 5. Open positions worst-case: Σ quantity × $1/share → USD → DESO nanos
  const { data: posRows, error: posErr } = await supabase
    .from('positions')
    .select('quantity')
    .eq('status', 'open');
  if (posErr) throw new Error(`[computePlatformLiability] positions: ${posErr.message}`);

  const openUsd = (posRows ?? []).reduce(
    (sum: number, r: { quantity: number }) => sum + Number(r.quantity),
    0
  );
  const openPositionNanos = usdToDesoNanos(openUsd, desoUsdRate) ?? BigInt(0);

  // 6. Pending position payouts (already resolved, awaiting user claim)
  const { data: payRows, error: payErr } = await supabase
    .from('position_payouts')
    .select('payout_amount_nanos')
    .in('claim_status', ['pending', 'in_flight']);
  if (payErr) throw new Error(`[computePlatformLiability] position_payouts: ${payErr.message}`);

  const pendingPayoutsNanos = (payRows ?? []).reduce(
    (sum: bigint, r: { payout_amount_nanos: number | string }) =>
      sum + BigInt(Math.floor(Number(r.payout_amount_nanos))),
    BigInt(0)
  );

  // 7. Creator escrow (USD held until creator claims)
  const { data: escRows, error: escErr } = await supabase
    .from('creators')
    .select('unclaimed_earnings_escrow')
    .gt('unclaimed_earnings_escrow', 0);
  if (escErr) throw new Error(`[computePlatformLiability] creators: ${escErr.message}`);

  const escrowUsd = (escRows ?? []).reduce(
    (sum: number, r: { unclaimed_earnings_escrow: number }) =>
      sum + Number(r.unclaimed_earnings_escrow),
    0
  );
  const creatorEscrowNanos = usdToDesoNanos(escrowUsd, desoUsdRate) ?? BigInt(0);

  // 8. DESO liability total
  const desoLiabilityNanos = openPositionNanos + pendingPayoutsNanos + creatorEscrowNanos;

  // 9. Holder rewards per coin (pending rows have amount_usd; amount_creator_coin_nanos is NULL)
  const { data: hrRows, error: hrErr } = await supabase
    .from('holder_rewards')
    .select('token_slug, amount_usd')
    .in('status', ['pending', 'in_flight']);
  if (hrErr) throw new Error(`[computePlatformLiability] holder_rewards: ${hrErr.message}`);

  // Group by token_slug
  const rewardsBySlug: Record<string, { totalUsd: number; rowCount: number }> = {};
  for (const row of hrRows ?? []) {
    const r = row as { token_slug: string; amount_usd: number };
    if (!rewardsBySlug[r.token_slug]) {
      rewardsBySlug[r.token_slug] = { totalUsd: 0, rowCount: 0 };
    }
    rewardsBySlug[r.token_slug].totalUsd += Number(r.amount_usd);
    rewardsBySlug[r.token_slug].rowCount += 1;
  }

  // Per-coin liability computation
  const coinLiability: TreasurySnapshot['liability']['creatorCoins'] = {};
  const coinExtractable: Record<string, bigint> = {};
  const coinStatus: Record<string, AssetStatus> = {};

  for (const [slug, { totalUsd, rowCount }] of Object.entries(rewardsBySlug)) {
    let priceDeso: number | null = null;
    try {
      priceDeso = await getCoinPriceFn(slug);
    } catch {
      // fall through to unknown
    }

    if (priceDeso === null || priceDeso <= 0) {
      warnings.push(`[${slug}] price fetch failed — coin liability unknown`);
      coinLiability[slug] = {
        nanos: BigInt(0),
        breakdown: {
          pending_holder_rewards_usd: totalUsd,
          pending_holder_rewards_rows: rowCount,
          current_coin_price_usd: null,
        },
      };
      coinStatus[slug] = 'unknown';
      coinExtractable[slug] =
        (coinBalances[slug] ?? BigInt(0)) - DEFAULT_OPERATIONAL_BUFFER_COIN_NANOS;
      continue;
    }

    // Price in DESO/coin × rate = USD/coin. NEVER skip the × desoUsdRate step —
    // mixing units here inflates liability by ~5x at current DESO prices.
    const coinPriceUsd = priceDeso * desoUsdRate;
    const liabilityNanos = usdToCoinNanos(totalUsd, coinPriceUsd);

    coinLiability[slug] = {
      nanos: liabilityNanos,
      breakdown: {
        pending_holder_rewards_usd: totalUsd,
        pending_holder_rewards_rows: rowCount,
        current_coin_price_usd: coinPriceUsd,
      },
    };

    const walletBal = coinBalances[slug] ?? BigInt(0);
    const extr = walletBal - liabilityNanos - DEFAULT_OPERATIONAL_BUFFER_COIN_NANOS;
    coinExtractable[slug] = extr;
    coinStatus[slug] = classifyStatus(extr, DEFAULT_OPERATIONAL_BUFFER_COIN_NANOS);
  }

  // 10-11. DESO extractable + status
  const desoExtractable = desoBalanceNanos - desoLiabilityNanos - bufferDesoNanos;

  return {
    asOf: new Date().toISOString(),
    desoUsdRate,
    walletBalances: {
      deso_nanos: desoBalanceNanos,
      creatorCoins: coinBalances,
    },
    liability: {
      deso_nanos: desoLiabilityNanos,
      deso_breakdown: {
        open_position_worst_case_nanos: openPositionNanos,
        pending_position_payouts_nanos: pendingPayoutsNanos,
        creator_escrow_nanos: creatorEscrowNanos,
      },
      creatorCoins: coinLiability,
    },
    extractable: {
      deso_nanos: desoExtractable,
      creatorCoins: coinExtractable,
    },
    status: {
      deso: classifyStatus(desoExtractable, bufferDesoNanos),
      creatorCoins: coinStatus,
    },
    warnings,
  };
}
