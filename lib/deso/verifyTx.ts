/**
 * P2-2 — DeSo transaction verifier.
 *
 * Given a tx hash (hex), confirm on the DeSo chain that:
 *   1. The tx exists and is type BASIC_TRANSFER
 *   2. The sender matches the expected (authenticated) sender
 *   3. One of the outputs pays the expected recipient at least
 *      the expected amount of nanos
 *
 * Fails closed: any DeSo API unreachability returns ok:false with
 * reason "deso-api-unreachable". Callers MUST treat that as NOT
 * verified and reject the caller's request.
 *
 * Does NOT handle replay prevention — that's enforced at the DB
 * layer via UNIQUE constraint on trades.tx_hash (P2-2.3).
 *
 * See docs/P2-2-verify-tx-design.md for full design rationale.
 */

import bs58 from "bs58";
import { sha256 } from "@noble/hashes/sha2.js";

const DESO_MAINNET_PREFIX = new Uint8Array([0xcd, 0x14, 0x00]);
const DESO_NODE_URL = "https://node.deso.org";
const DESO_API_TIMEOUT_MS = 5000;

export type VerifyOk = {
  ok: true;
  actualAmountNanos: number;
  blockHashHex: string | null;
};

export type VerifyFailReason =
  | "invalid-hex"
  | "invalid-encoding"
  | "tx-not-found"
  | "tx-not-basic-transfer"
  | "sender-mismatch"
  | "recipient-not-found"
  | "amount-too-low"
  | "deso-api-unreachable";

export type VerifyFail = {
  ok: false;
  reason: VerifyFailReason;
  detail?: string;
};

export type VerifyResult = VerifyOk | VerifyFail;

/**
 * Verify a DeSo basic transfer on-chain.
 *
 * @param txHashHex        64-char lowercase hex string (32 bytes).
 * @param expectedSender   Base58Check public key the tx must come from.
 * @param expectedRecipient Base58Check public key that must receive funds.
 * @param expectedAmountNanos  Min nanos that must be paid to recipient.
 *                              Uses >= so rate/rounding drift is absorbed.
 */
export async function verifyDesoTransfer(
  txHashHex: string,
  expectedSender: string,
  expectedRecipient: string,
  expectedAmountNanos: number
): Promise<VerifyResult> {
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

  if (tx.TransactionType !== "BASIC_TRANSFER") {
    return {
      ok: false,
      reason: "tx-not-basic-transfer",
      detail: `Got TransactionType=${tx.TransactionType}`,
    };
  }

  const actualSender = tx.TransactionMetadata?.TransactorPublicKeyBase58Check;
  if (actualSender !== expectedSender) {
    return {
      ok: false,
      reason: "sender-mismatch",
      detail: `expected=${expectedSender} actual=${actualSender ?? "null"}`,
    };
  }

  // 5. Find the recipient in Outputs[]
  const outputs = tx.Outputs ?? [];
  const match = outputs.find(
    (o) => o.PublicKeyBase58Check === expectedRecipient
  );
  if (!match) {
    return { ok: false, reason: "recipient-not-found" };
  }

  if (match.AmountNanos < expectedAmountNanos) {
    return {
      ok: false,
      reason: "amount-too-low",
      detail: `expected>=${expectedAmountNanos} got=${match.AmountNanos}`,
    };
  }

  return {
    ok: true,
    actualAmountNanos: match.AmountNanos,
    blockHashHex: tx.BlockHashHex && tx.BlockHashHex.length > 0 ? tx.BlockHashHex : null,
  };
}

/**
 * Convert a 64-char hex tx hash to DeSo's base58check format.
 * Uses the same encoding as public keys: 3-byte mainnet prefix +
 * 32 raw bytes + 4-byte sha256-double checksum.
 *
 * Exported for unit testing.
 */
export function hexTxHashToDesoBase58Check(hex: string): string {
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error(`Invalid hex: expected 64 chars, got ${hex.length}`);
  }
  const raw = hexToBytes(hex);
  const payload = concatBytes(DESO_MAINNET_PREFIX, raw);
  const checksum = sha256(sha256(payload)).slice(0, 4);
  const full = concatBytes(payload, checksum);
  return bs58.encode(full);
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

// ─── DeSo API types (partial — only what verifyTx parses) ────────

type TxInfoResponse = {
  Transactions?: TxInfoTransaction[];
  Error?: string;
};

type TxInfoTransaction = {
  TransactionIDBase58Check?: string;
  TransactionHashHex?: string;
  TransactionType?: string;
  Outputs?: TxOutput[] | null;
  TransactionMetadata?: {
    TxnType?: string;
    TransactorPublicKeyBase58Check?: string;
    AffectedPublicKeys?: Array<{ PublicKeyBase58Check?: string; Metadata?: string }> | null;
    TxnOutputs?: Array<{ PublicKey?: string; AmountNanos?: number }> | null;
    BasicTransferTxindexMetadata?: {
      TotalInputNanos?: number;
      TotalOutputNanos?: number;
      FeeNanos?: number;
    } | null;
  };
  BlockHashHex?: string;
  TxnFeeNanos?: number;
  TxnVersion?: number;
};

type TxOutput = {
  PublicKeyBase58Check?: string;
  AmountNanos: number;
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
      body: JSON.stringify({ TransactionIDBase58Check: transactionIdBase58Check }),
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
