import { getUserDesoBalance, getCreatorCoinHoldings } from "./api";

// ── Types ────────────────────────────────────────────────────────────────────

export type SolvencyOk = {
  ok: true;
  available: bigint;
};

export type SolvencyFailReason =
  | "insufficient"   // balance < required
  | "fetch-failed";  // DeSo API errored or returned malformed data

export type SolvencyFail = {
  ok: false;
  reason: SolvencyFailReason;
  required: bigint;
  available?: bigint;
  detail?: string;
};

export type SolvencyResult = SolvencyOk | SolvencyFail;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Check whether a wallet holds at least `requiredNanos` DESO.
 *
 * Composes over `getUserDesoBalance` from lib/deso/api.ts.
 * Returns a tagged SolvencyResult — never throws.
 * Fail-closed on fetch error (reason: "fetch-failed").
 */
export async function checkDesoSolvency(
  publicKey: string,
  requiredNanos: bigint
): Promise<SolvencyResult> {
  let balanceNanos: number;
  try {
    const result = await getUserDesoBalance(publicKey);
    if (
      result == null ||
      typeof result !== "object" ||
      typeof result.balanceNanos !== "number"
    ) {
      return {
        ok: false,
        reason: "fetch-failed",
        required: requiredNanos,
        detail: "unexpected response shape from getUserDesoBalance",
      };
    }
    balanceNanos = result.balanceNanos;
  } catch (err) {
    return {
      ok: false,
      reason: "fetch-failed",
      required: requiredNanos,
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const available = BigInt(balanceNanos);
  if (available >= requiredNanos) {
    return { ok: true, available };
  }
  return { ok: false, reason: "insufficient", required: requiredNanos, available };
}

/**
 * Check whether a holder wallet holds at least `requiredNanos` nanos-worth
 * of a specific creator's coin.
 *
 * Composes over `getCreatorCoinHoldings` from lib/deso/api.ts.
 * Returns a tagged SolvencyResult — never throws.
 * Fail-closed on fetch error (reason: "fetch-failed").
 */
export async function checkCreatorCoinSolvency(
  holderPublicKey: string,
  creatorPublicKey: string,
  requiredNanos: bigint
): Promise<SolvencyResult> {
  let balanceNanos: number;
  try {
    const result = await getCreatorCoinHoldings(holderPublicKey, creatorPublicKey);
    if (
      result == null ||
      typeof result !== "object" ||
      typeof result.balanceNanos !== "number"
    ) {
      return {
        ok: false,
        reason: "fetch-failed",
        required: requiredNanos,
        detail: "unexpected response shape from getCreatorCoinHoldings",
      };
    }
    balanceNanos = result.balanceNanos;
  } catch (err) {
    return {
      ok: false,
      reason: "fetch-failed",
      required: requiredNanos,
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const available = BigInt(balanceNanos);
  if (available >= requiredNanos) {
    return { ok: true, available };
  }
  return { ok: false, reason: "insufficient", required: requiredNanos, available };
}
