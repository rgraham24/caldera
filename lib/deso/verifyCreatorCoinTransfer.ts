/**
 * HRV-2 — DeSo creator-coin transfer verifier.
 *
 * Given a tx hash (hex), confirm on the DeSo chain that:
 *   1. The tx exists and is type CREATOR_COIN_TRANSFER
 *   2. The sender matches the expected (platform) sender
 *   3. The recipient (in AffectedPublicKeys[Metadata="ReceiverPublicKey"])
 *      matches the expected holder
 *   4. The creator coin (CreatorUsername) matches the expected username
 *      (case-insensitive)
 *   5. The amount (CreatorCoinToTransferNanos) exactly matches the
 *      expected amount
 *
 * Fails closed: any DeSo API unreachability returns ok:false with
 * reason "deso-api-unreachable". Callers MUST treat that as NOT
 * verified and reject the caller's request.
 *
 * Sister primitive to lib/deso/verifyTx.ts (which verifies
 * BASIC_TRANSFER transactions used for DESO sends). CREATOR_COIN_TRANSFER
 * has different transaction metadata structure entirely:
 *   - No Outputs array (TxnOutputs is null on chain)
 *   - Recipient is in AffectedPublicKeys with Metadata="ReceiverPublicKey"
 *   - Amount is in CreatorCoinTransferTxindexMetadata, not in outputs
 *   - Identifies coin by username, not by creator pubkey
 *
 * Used by holder rewards reconciliation (sweep + drift-check) to verify
 * the on-chain state of holder_rewards rows in 'in_flight' or 'claimed'
 * status.
 */

import { hexTxHashToDesoBase58Check } from "./verifyTx";

const DESO_NODE_URL = "https://node.deso.org";
const DESO_API_TIMEOUT_MS = 5000;

export type VerifyCreatorCoinOk = {
  ok: true;
  actualAmountNanos: number;
  blockHashHex: string | null;
};

export type VerifyCreatorCoinFailReason =
  | "invalid-hex"
  | "invalid-encoding"
  | "tx-not-found"
  | "tx-not-creator-coin-transfer"
  | "sender-mismatch"
  | "recipient-not-found"
  | "creator-username-mismatch"
  | "amount-mismatch"
  | "deso-api-unreachable";

export type VerifyCreatorCoinFail = {
  ok: false;
  reason: VerifyCreatorCoinFailReason;
  detail?: string;
};

export type VerifyCreatorCoinResult =
  | VerifyCreatorCoinOk
  | VerifyCreatorCoinFail;

/**
 * Verify a DeSo creator coin transfer on-chain.
 *
 * @param txHashHex             64-char lowercase hex string (32 bytes).
 * @param expectedSender        Base58Check public key the tx must come from.
 *                               (Platform wallet for holder rewards.)
 * @param expectedRecipient     Base58Check public key that must receive coins.
 * @param expectedCreatorUsername  Username of the creator coin transferred.
 *                                  Compared case-insensitively against the
 *                                  on-chain CreatorUsername field. For Caldera
 *                                  this is the holder_rewards.token_slug value.
 * @param expectedAmountNanos   Exact creator coin nanos that must have been
 *                               transferred. Unlike DESO transfers (which use
 *                               >= for rate drift), creator coin amounts are
 *                               stored at claim time and must match exactly.
 */
export async function verifyCreatorCoinTransfer(
  txHashHex: string,
  expectedSender: string,
  expectedRecipient: string,
  expectedCreatorUsername: string,
  expectedAmountNanos: number
): Promise<VerifyCreatorCoinResult> {
  // 1. Validate hex input shape
  if (!/^[0-9a-f]{64}$/i.test(txHashHex)) {
    return { ok: false, reason: "invalid-hex" };
  }

  // 2. hex → base58check (DeSo format: prefix + 32 bytes + sha256d checksum)
  let txIdBase58: string;
  try {
    txIdBase58 = hexTxHashToDesoBase58Check(txHashHex);
  } catch (e) {
    return {
      ok: false,
      reason: "invalid-encoding",
      detail: e instanceof Error ? e.message : "unknown encoding error",
    };
  }

  // 3. Query DeSo
  let txResponse: TxInfoResponse;
  try {
    txResponse = await fetchDesoTransactionInfo(txIdBase58);
  } catch (e) {
    return {
      ok: false,
      reason: "deso-api-unreachable",
      detail: e instanceof Error ? e.message : "fetch error",
    };
  }

  // 4. Verify structure + identity
  const txs = txResponse.Transactions;
  if (!txs || txs.length === 0) {
    return { ok: false, reason: "tx-not-found" };
  }
  const tx = txs[0];

  if (tx.TransactionType !== "CREATOR_COIN_TRANSFER") {
    return {
      ok: false,
      reason: "tx-not-creator-coin-transfer",
      detail: `Got TransactionType=${tx.TransactionType}`,
    };
  }

  const meta = tx.TransactionMetadata;
  const actualSender = meta?.TransactorPublicKeyBase58Check;
  if (actualSender !== expectedSender) {
    return {
      ok: false,
      reason: "sender-mismatch",
      detail: `expected=${expectedSender} actual=${actualSender ?? "null"}`,
    };
  }

  // 5. Find the recipient in AffectedPublicKeys (NOT in Outputs — creator
  //    coin transfers have no Outputs array).
  const affected = meta?.AffectedPublicKeys ?? [];
  const recipientEntry = affected.find(
    (a) =>
      a.Metadata === "ReceiverPublicKey" &&
      a.PublicKeyBase58Check === expectedRecipient
  );
  if (!recipientEntry) {
    return { ok: false, reason: "recipient-not-found" };
  }

  // 6. Verify creator coin (by username, case-insensitive)
  const ccMeta = meta?.CreatorCoinTransferTxindexMetadata;
  const actualUsername = ccMeta?.CreatorUsername ?? "";
  if (actualUsername.toLowerCase() !== expectedCreatorUsername.toLowerCase()) {
    return {
      ok: false,
      reason: "creator-username-mismatch",
      detail: `expected=${expectedCreatorUsername} actual=${actualUsername || "null"}`,
    };
  }

  // 7. Verify amount (exact match — no rate drift for creator coins)
  const actualAmount = ccMeta?.CreatorCoinToTransferNanos ?? 0;
  if (actualAmount !== expectedAmountNanos) {
    return {
      ok: false,
      reason: "amount-mismatch",
      detail: `expected=${expectedAmountNanos} actual=${actualAmount}`,
    };
  }

  return {
    ok: true,
    actualAmountNanos: actualAmount,
    blockHashHex:
      tx.BlockHashHex && tx.BlockHashHex.length > 0 ? tx.BlockHashHex : null,
  };
}

// ─── DeSo API types (partial — only what this verifier parses) ────

type TxInfoResponse = {
  Transactions?: TxInfoTransaction[];
  Error?: string;
};

type TxInfoTransaction = {
  TransactionIDBase58Check?: string;
  TransactionHashHex?: string;
  TransactionType?: string;
  TransactionMetadata?: {
    TxnType?: string;
    TransactorPublicKeyBase58Check?: string;
    AffectedPublicKeys?: Array<{
      PublicKeyBase58Check?: string;
      Metadata?: string;
    }> | null;
    CreatorCoinTransferTxindexMetadata?: {
      CreatorUsername?: string;
      CreatorCoinToTransferNanos?: number;
      DiamondLevel?: number;
      PostHashHex?: string;
    } | null;
  };
  BlockHashHex?: string;
};

// ─── Low-level fetch helper ──────────────────────────────────────

async function fetchDesoTransactionInfo(
  transactionIdBase58Check: string
): Promise<TxInfoResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DESO_API_TIMEOUT_MS);
  try {
    const res = await fetch(`${DESO_NODE_URL}/api/v1/transaction-info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        TransactionIDBase58Check: transactionIdBase58Check,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`DeSo API returned HTTP ${res.status}`);
    }
    const json = (await res.json()) as TxInfoResponse;
    return json;
  } finally {
    clearTimeout(timer);
  }
}
