/**
 * P2-4 — Transfer creator coins from the platform wallet on-chain.
 *
 * Single-responsibility primitive: given a creator, recipient, and
 * amount-in-creator-coin-nanos, submit a DeSo TransferCreatorCoin
 * transaction signed by the platform wallet.
 *
 * Does NOT touch the database. Does NOT compute prices. Does NOT
 * aggregate ledger rows. Those concerns belong to the caller
 * (Phase 3 Path 4: holder rewards claim route).
 *
 * Fails closed: any error returns a typed TransferFail; the caller
 * is expected to keep the relevant ledger row(s) in 'pending' status.
 *
 * See docs/P2-4-transfer-design.md for full design rationale.
 */

import { signAndSubmit } from "@/lib/deso/transaction";

// DeSo REST endpoint — pin to node.deso.org for determinism; rate+uptime
// are fine in practice, we can point at a private node later if needed.
const DESO_NODE_URL = "https://node.deso.org";
const CONSTRUCT_TX_TIMEOUT_MS = 5000;

// DeSo public keys are base58check with a 3-byte mainnet prefix plus
// 33-byte compressed pubkey plus 4-byte checksum. The base58check
// encoding of that 40-byte blob is consistently 54 chars starting with
// "BC1Y". We shape-validate with a regex; deep cryptographic validation
// is unnecessary here because DeSo's API does its own validation and
// the platform seed binds the sender to a known-good value.
const BASE58CHECK_PUBKEY_REGEX = /^BC1Y[1-9A-HJ-NP-Za-km-z]{51}$/;

// DeSo documents MinFeeRateNanosPerKB around 1000 nanos/KB. We match
// the rate that lib/deso/buyback.ts uses.
const MIN_FEE_RATE_NANOS_PER_KB = 1000;

export type TransferOk = {
  ok: true;
  txHashHex: string;
  feeNanos: number;
};

export type TransferFailReason =
  | "invalid-public-key"
  | "invalid-amount"
  | "construct-failed"
  | "sign-failed"
  | "submit-failed"
  | "deso-api-unreachable";

export type TransferFail = {
  ok: false;
  reason: TransferFailReason;
  detail?: string;
};

export type TransferResult = TransferOk | TransferFail;

export type TransferCreatorCoinParams = {
  creatorPublicKey: string;
  recipientPublicKey: string;
  creatorCoinNanos: bigint;
  platformPublicKey: string;
  platformSeed: string;
};

/**
 * Transfer creator coins on-chain.
 */
export async function transferCreatorCoin(
  params: TransferCreatorCoinParams
): Promise<TransferResult> {
  const {
    creatorPublicKey,
    recipientPublicKey,
    creatorCoinNanos,
    platformPublicKey,
    platformSeed,
  } = params;

  // ── Input validation ─────────────────────────────────────────
  if (
    !BASE58CHECK_PUBKEY_REGEX.test(creatorPublicKey) ||
    !BASE58CHECK_PUBKEY_REGEX.test(recipientPublicKey) ||
    !BASE58CHECK_PUBKEY_REGEX.test(platformPublicKey)
  ) {
    return { ok: false, reason: "invalid-public-key" };
  }

  if (typeof platformSeed !== "string" || platformSeed.length === 0) {
    return {
      ok: false,
      reason: "sign-failed",
      detail: "platformSeed is empty",
    };
  }

  // Reject zero/negative nanos. bigint comparison is safe for any size.
  if (creatorCoinNanos <= BigInt(0)) {
    return { ok: false, reason: "invalid-amount" };
  }

  // DeSo's API expects `number` for CreatorCoinToTransferNanos. If the
  // bigint exceeds Number.MAX_SAFE_INTEGER, reject — we refuse to narrow
  // past safe-integer precision. In practice this upper bound is huge
  // (~9e15 nanos = 9 million creator coins). A real-world holder claim
  // will be far below this ceiling.
  if (creatorCoinNanos > BigInt(Number.MAX_SAFE_INTEGER)) {
    return {
      ok: false,
      reason: "invalid-amount",
      detail: "creatorCoinNanos exceeds Number.MAX_SAFE_INTEGER",
    };
  }
  const creatorCoinNanosNumber = Number(creatorCoinNanos);

  // ── Construct unsigned transaction ───────────────────────────
  let constructResponse: ConstructResponse;
  try {
    constructResponse = await fetchConstructTx({
      senderPublicKey: platformPublicKey,
      creatorPublicKey,
      recipientPublicKey,
      creatorCoinNanos: creatorCoinNanosNumber,
    });
  } catch (e) {
    return {
      ok: false,
      reason: "deso-api-unreachable",
      detail: e instanceof Error ? e.message : "fetch error",
    };
  }

  if (!constructResponse.TransactionHex) {
    return {
      ok: false,
      reason: "construct-failed",
      detail: "DeSo API response missing TransactionHex",
    };
  }

  // ── Sign + submit ────────────────────────────────────────────
  const submit = await signAndSubmit(
    constructResponse.TransactionHex,
    platformSeed
  );

  if (!submit.success) {
    const stage = (submit as { stage?: "sign" | "submit" }).stage;
    const rawError = (submit as { error?: unknown }).error;
    const errMsg =
      rawError instanceof Error
        ? rawError.message
        : String(rawError ?? "unknown");
    return {
      ok: false,
      reason: stage === "sign" ? "sign-failed" : "submit-failed",
      detail: errMsg,
    };
  }

  return {
    ok: true,
    txHashHex: submit.txHashHex,
    feeNanos: constructResponse.FeeNanos ?? 0,
  };
}

// ─── DeSo REST type surface (partial — only fields we use) ──────

type ConstructResponse = {
  TransactionHex?: string;
  FeeNanos?: number;
  TxnHashHex?: string;
  SpendAmountNanos?: number;
  ChangeAmountNanos?: number;
  TotalInputNanos?: number;
};

async function fetchConstructTx(args: {
  senderPublicKey: string;
  creatorPublicKey: string;
  recipientPublicKey: string;
  creatorCoinNanos: number;
}): Promise<ConstructResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONSTRUCT_TX_TIMEOUT_MS);
  try {
    const res = await fetch(`${DESO_NODE_URL}/api/v0/transfer-creator-coin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        SenderPublicKeyBase58Check: args.senderPublicKey,
        CreatorPublicKeyBase58Check: args.creatorPublicKey,
        ReceiverUsernameOrPublicKeyBase58Check: args.recipientPublicKey,
        CreatorCoinToTransferNanos: args.creatorCoinNanos,
        MinFeeRateNanosPerKB: MIN_FEE_RATE_NANOS_PER_KB,
        TransactionFees: null,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(`DeSo API HTTP ${res.status}: ${bodyText.slice(0, 200)}`);
    }
    return (await res.json()) as ConstructResponse;
  } finally {
    clearTimeout(timer);
  }
}
