/**
 * lib/deso/rate.ts
 *
 * Shared helpers for DeSo→USD rate fetching and conversion.
 * Extracted so all code paths that need to convert between USD and
 * DESO nanos share one canonical implementation.
 *
 * Callers that previously inlined fetch(`${DESO_API_BASE}/api/v0/get-exchange-rate`)
 * should migrate to fetchDesoUsdRate() here.
 */

const DESO_API_BASE = 'https://api.deso.org';
const NANOS_PER_DESO = BigInt(1_000_000_000);

/**
 * Fetch the current DESO → USD exchange rate.
 *
 * Returns the rate as dollars-per-DESO, or null on any failure
 * (network error, non-200 response, zero rate).
 *
 * Never throws — callers that need a rate but got null must decide
 * whether to skip, fail, or proceed with NULL downstream.
 */
export async function fetchDesoUsdRate(): Promise<number | null> {
  try {
    const response = await fetch(`${DESO_API_BASE}/api/v0/get-exchange-rate`);
    if (!response.ok) {
      console.error(`[fetchDesoUsdRate] DeSo returned ${response.status}`);
      return null;
    }
    const data = await response.json();
    const cents = data.USDCentsPerDeSoExchangeRate ?? 0;
    return cents > 0 ? cents / 100 : null;
  } catch (err) {
    console.error(
      '[fetchDesoUsdRate] fetch failed:',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * Convert a USD amount to DESO nanos at the given rate.
 *
 * Returns bigint to preserve precision on large amounts (nanos can
 * exceed Number.MAX_SAFE_INTEGER for large DESO balances).
 *
 * Returns null if the rate is non-positive, NaN, or if the USD amount
 * is negative/NaN. Callers must handle null explicitly — it means
 * the conversion cannot be performed safely.
 *
 * Truncates toward zero (no rounding up). $0.0000001 at a realistic
 * rate will round to 0n — callers that need a non-zero amount should
 * check the result before using it.
 */
export function usdToDesoNanos(
  usd: number,
  usdPerDeso: number
): bigint | null {
  // Validate rate
  if (!Number.isFinite(usdPerDeso) || usdPerDeso <= 0) {
    return null;
  }
  // Validate USD
  if (!Number.isFinite(usd) || usd < 0) {
    return null;
  }
  if (usd === 0) {
    return BigInt(0);
  }

  // USD → DESO → nanos, truncated to integer
  const desoAmount = usd / usdPerDeso;
  const nanosAsFloat = desoAmount * 1e9;
  // Math.floor before BigInt to avoid float→bigint precision issues.
  const nanos = Math.floor(nanosAsFloat);
  return BigInt(nanos);
}

// Exported so other modules can reference the constant without duplicating it.
export { DESO_API_BASE, NANOS_PER_DESO };
