import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  verifyDesoTransfer,
  hexTxHashToDesoBase58Check,
} from "@/lib/deso/verifyTx";

// Known-good fixture: this is the real tx we verified by hand during
// P2-2 research. Keeping it here pins encoding correctness.
const KNOWN_TX_HASH_HEX =
  "3459d59cc8efa4dc76c8802cc6b72510e7c90bf2af31da85edc8d8c2fdee6116";
const KNOWN_TX_ID_BASE58 =
  "3JuET8pxHCbd45GCdmohN1PugJ3vEyGxEuBS5kq9t444YBDngiC1HV";
const KNOWN_SENDER = "BC1YLhriEzhGkrKzUGmL3B4Zdq9S63oGVSYMhUV1UT5vDoRieHceZBB";
const KNOWN_RECIPIENT = "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7";
const KNOWN_AMOUNT_NANOS = 211416490;

describe("hexTxHashToDesoBase58Check", () => {
  it("encodes known-good tx hash to expected base58check string", () => {
    expect(hexTxHashToDesoBase58Check(KNOWN_TX_HASH_HEX)).toBe(
      KNOWN_TX_ID_BASE58
    );
  });

  it("is case-insensitive on hex input", () => {
    const upper = KNOWN_TX_HASH_HEX.toUpperCase();
    expect(hexTxHashToDesoBase58Check(upper)).toBe(KNOWN_TX_ID_BASE58);
  });

  it("throws on non-hex input", () => {
    expect(() => hexTxHashToDesoBase58Check("not-a-hex")).toThrow(/Invalid hex/);
  });

  it("throws on wrong-length hex", () => {
    expect(() => hexTxHashToDesoBase58Check("dead")).toThrow(/Invalid hex/);
  });
});

// ─── fetch mock ─────────────────────────────────────────────────

function mockFetchJson(body: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

function mockFetchReject(err: Error) {
  global.fetch = vi.fn().mockRejectedValue(err);
}

function realResponseForKnownTx(overrides: Record<string, unknown> = {}) {
  // Shape derived from the actual live response during P2-2 research.
  const tx = {
    TransactionIDBase58Check: KNOWN_TX_ID_BASE58,
    TransactionHashHex: KNOWN_TX_HASH_HEX,
    TransactionType: "BASIC_TRANSFER",
    Outputs: [
      { PublicKeyBase58Check: KNOWN_RECIPIENT, AmountNanos: KNOWN_AMOUNT_NANOS },
    ],
    TransactionMetadata: {
      TxnType: "BASIC_TRANSFER",
      TransactorPublicKeyBase58Check: KNOWN_SENDER,
      AffectedPublicKeys: [
        { PublicKeyBase58Check: KNOWN_RECIPIENT, Metadata: "BasicTransferOutput" },
      ],
      TxnOutputs: [
        { PublicKey: "base64-encoded-bytes", AmountNanos: KNOWN_AMOUNT_NANOS },
      ],
      BasicTransferTxindexMetadata: {
        TotalInputNanos: KNOWN_AMOUNT_NANOS + 168,
        TotalOutputNanos: KNOWN_AMOUNT_NANOS,
        FeeNanos: 168,
      },
    },
    BlockHashHex: "abc123def456",
    TxnFeeNanos: 168,
    TxnVersion: 1,
    ...overrides,
  };
  return { Error: "", Transactions: [tx] };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("verifyDesoTransfer — happy path", () => {
  it("returns ok:true when sender/recipient/amount match exactly", async () => {
    mockFetchJson(realResponseForKnownTx());
    const result = await verifyDesoTransfer(
      KNOWN_TX_HASH_HEX,
      KNOWN_SENDER,
      KNOWN_RECIPIENT,
      KNOWN_AMOUNT_NANOS
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actualAmountNanos).toBe(KNOWN_AMOUNT_NANOS);
      expect(result.blockHashHex).toBe("abc123def456");
    }
  });

  it("returns ok:true when on-chain amount exceeds expected (absorb rounding)", async () => {
    mockFetchJson(realResponseForKnownTx());
    const result = await verifyDesoTransfer(
      KNOWN_TX_HASH_HEX,
      KNOWN_SENDER,
      KNOWN_RECIPIENT,
      KNOWN_AMOUNT_NANOS - 1000
    );
    expect(result.ok).toBe(true);
  });

  it("returns blockHashHex=null when tx is in mempool only", async () => {
    mockFetchJson(realResponseForKnownTx({ BlockHashHex: "" }));
    const result = await verifyDesoTransfer(
      KNOWN_TX_HASH_HEX,
      KNOWN_SENDER,
      KNOWN_RECIPIENT,
      KNOWN_AMOUNT_NANOS
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.blockHashHex).toBeNull();
  });
});

describe("verifyDesoTransfer — validation failures", () => {
  it("returns invalid-hex for non-hex input", async () => {
    const result = await verifyDesoTransfer("not-hex", KNOWN_SENDER, KNOWN_RECIPIENT, 1);
    expect(result).toEqual({ ok: false, reason: "invalid-hex" });
  });

  it("returns invalid-hex for wrong-length input", async () => {
    const result = await verifyDesoTransfer("dead", KNOWN_SENDER, KNOWN_RECIPIENT, 1);
    expect(result).toEqual({ ok: false, reason: "invalid-hex" });
  });
});

describe("verifyDesoTransfer — on-chain check failures", () => {
  it("returns tx-not-found when Transactions is empty", async () => {
    mockFetchJson({ Error: "", Transactions: [] });
    const result = await verifyDesoTransfer(
      KNOWN_TX_HASH_HEX,
      KNOWN_SENDER,
      KNOWN_RECIPIENT,
      KNOWN_AMOUNT_NANOS
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("tx-not-found");
  });

  it("returns tx-not-found when Transactions is null", async () => {
    mockFetchJson({ Error: "", Transactions: null });
    const result = await verifyDesoTransfer(
      KNOWN_TX_HASH_HEX,
      KNOWN_SENDER,
      KNOWN_RECIPIENT,
      KNOWN_AMOUNT_NANOS
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("tx-not-found");
  });

  it("returns tx-not-basic-transfer when TransactionType is CREATOR_COIN", async () => {
    mockFetchJson(realResponseForKnownTx({ TransactionType: "CREATOR_COIN" }));
    const result = await verifyDesoTransfer(
      KNOWN_TX_HASH_HEX,
      KNOWN_SENDER,
      KNOWN_RECIPIENT,
      KNOWN_AMOUNT_NANOS
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("tx-not-basic-transfer");
  });

  it("returns sender-mismatch when sender differs", async () => {
    mockFetchJson(realResponseForKnownTx());
    const result = await verifyDesoTransfer(
      KNOWN_TX_HASH_HEX,
      "BC1YLdifferent-sender-00000000000000000000000000000000",
      KNOWN_RECIPIENT,
      KNOWN_AMOUNT_NANOS
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("sender-mismatch");
  });

  it("returns recipient-not-found when recipient not in Outputs", async () => {
    mockFetchJson(realResponseForKnownTx());
    const result = await verifyDesoTransfer(
      KNOWN_TX_HASH_HEX,
      KNOWN_SENDER,
      "BC1YLdifferent-recipient-00000000000000000000000000",
      KNOWN_AMOUNT_NANOS
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("recipient-not-found");
  });

  it("returns amount-too-low when on-chain amount < expected", async () => {
    mockFetchJson(realResponseForKnownTx());
    const result = await verifyDesoTransfer(
      KNOWN_TX_HASH_HEX,
      KNOWN_SENDER,
      KNOWN_RECIPIENT,
      KNOWN_AMOUNT_NANOS + 1
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("amount-too-low");
  });
});

describe("verifyDesoTransfer — network failures", () => {
  it("returns deso-api-unreachable when fetch rejects", async () => {
    mockFetchReject(new Error("network timeout"));
    const result = await verifyDesoTransfer(
      KNOWN_TX_HASH_HEX,
      KNOWN_SENDER,
      KNOWN_RECIPIENT,
      KNOWN_AMOUNT_NANOS
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("deso-api-unreachable");
  });

  it("returns deso-api-unreachable when API returns non-2xx", async () => {
    mockFetchJson({}, 500);
    const result = await verifyDesoTransfer(
      KNOWN_TX_HASH_HEX,
      KNOWN_SENDER,
      KNOWN_RECIPIENT,
      KNOWN_AMOUNT_NANOS
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("deso-api-unreachable");
  });
});
