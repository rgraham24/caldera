/**
 * P3-5.3 — Native DESO transfer primitive.
 *
 * Mirrors lib/deso/transfer.ts (P2-4) for native DESO instead of
 * creator coins. Used by /api/creators/[slug]/claim to pay
 * creators their accrued earnings.
 *
 * Two-step on-chain flow:
 *   1. POST /api/v0/send-deso to build unsigned tx hex
 *   2. signAndSubmit(txHex, platformSeed)
 *
 * Returns tagged result. Fail-closed on network errors.
 *
 * See docs/P3-5-creator-claim-design.md.
 */

import { signAndSubmit } from "./transaction";

const DESO_API_BASE = "https://node.deso.org";
const MIN_FEE_RATE_NANOS_PER_KB = 1000;

export type TransferDesoParams = {
  recipientPublicKey: string;
  amountNanos: bigint;
  platformPublicKey: string;
  platformSeed: string;
};

export type TransferDesoResult =
  | { ok: true; txHashHex: string; feeNanos: bigint }
  | {
      ok: false;
      reason: "build-failed" | "submit-failed";
      detail: string;
    };

/**
 * Send native DESO from the platform wallet to a recipient.
 *
 * @returns Tagged result. Caller checks .ok before reading other fields.
 */
export async function transferDeso(
  params: TransferDesoParams
): Promise<TransferDesoResult> {
  const { recipientPublicKey, amountNanos, platformPublicKey, platformSeed } =
    params;

  if (amountNanos < BigInt(1)) {
    return {
      ok: false,
      reason: "build-failed",
      detail: `amountNanos must be >= 1, got ${amountNanos}`,
    };
  }

  // ── Step 1: Build unsigned tx via DeSo API ────────────────
  let txHex: string;
  let feeNanos: bigint = BigInt(0);
  try {
    const buildRes = await fetch(`${DESO_API_BASE}/api/v0/send-deso`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        SenderPublicKeyBase58Check: platformPublicKey,
        RecipientPublicKeyOrUsername: recipientPublicKey,
        AmountNanos: Number(amountNanos),
        MinFeeRateNanosPerKB: MIN_FEE_RATE_NANOS_PER_KB,
      }),
    });

    if (!buildRes.ok) {
      const errText = await buildRes.text();
      return {
        ok: false,
        reason: "build-failed",
        detail: `DeSo build returned ${buildRes.status}: ${errText.slice(0, 200)}`,
      };
    }

    const buildJson = (await buildRes.json()) as {
      TransactionHex?: string;
      FeeNanos?: number;
    };
    if (!buildJson.TransactionHex) {
      return {
        ok: false,
        reason: "build-failed",
        detail: "DeSo build response missing TransactionHex",
      };
    }
    txHex = buildJson.TransactionHex;
    feeNanos = BigInt(buildJson.FeeNanos ?? 0);
  } catch (e) {
    return {
      ok: false,
      reason: "build-failed",
      detail: e instanceof Error ? e.message : "unknown build error",
    };
  }

  // ── Step 2: Sign + submit ─────────────────────────────────
  // signAndSubmit returns { success: true; txHashHex } or
  // { success: false; stage: 'sign' | 'submit'; error: string }
  const submitResult = await signAndSubmit(txHex, platformSeed);

  if (!submitResult.success) {
    const stage = (submitResult as { stage?: "sign" | "submit" }).stage;
    return {
      ok: false,
      reason: stage === "sign" ? "build-failed" : "submit-failed",
      detail: submitResult.error ?? "unknown submit error",
    };
  }

  return {
    ok: true,
    txHashHex: submitResult.txHashHex,
    feeNanos,
  };
}
