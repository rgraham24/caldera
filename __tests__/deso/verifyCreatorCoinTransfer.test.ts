/**
 * HRV-3 — Tests for verifyCreatorCoinTransfer.
 *
 * Mirrors the structure of verifyTx.test.ts. Mocks global fetch
 * with realistic DeSo /api/v1/transaction-info responses.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyCreatorCoinTransfer } from "@/lib/deso/verifyCreatorCoinTransfer";

// Real-shape constants from a known on-chain tx (HRV-1.5):
//   tx eaf0ae77... — 455400 $bitcoin nanos from platform → BC1YLhri...ZBB
const REAL_TX_HASH =
  "eaf0ae776af24cbd4bc2657860714aba03d51157427554589e77a0570f1be043";
const PLATFORM_WALLET = "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7";
const HOLDER_WALLET = "BC1YLhriEzhGkrKzUGmL3B4Zdq9S63oGVSYMhUV1UT5vDoRieHceZBB";
const BLOCK_HASH = "a4fda003428aba909fa74034894dd66c99befa01caee89a3b20364c65fcc7fd6";

/**
 * Helper: build a mock DeSo transaction-info response for a creator
 * coin transfer. Defaults to the real on-chain values; override
 * any field via params.
 */
function mockCctResponse(overrides: {
  TransactionType?: string;
  TransactorPublicKey?: string;
  ReceiverPublicKey?: string | null;
  ReceiverMetadata?: string;
  CreatorUsername?: string;
  CreatorCoinToTransferNanos?: number;
  BlockHashHex?: string;
  Empty?: boolean;
} = {}) {
  if (overrides.Empty) {
    return { Error: "", Transactions: [] };
  }

  const affectedPublicKeys: Array<{
    PublicKeyBase58Check: string;
    Metadata: string;
  }> = [];

  if (overrides.ReceiverPublicKey !== null) {
    affectedPublicKeys.push({
      PublicKeyBase58Check: overrides.ReceiverPublicKey ?? HOLDER_WALLET,
      Metadata: overrides.ReceiverMetadata ?? "ReceiverPublicKey",
    });
  }

  affectedPublicKeys.push({
    PublicKeyBase58Check: overrides.TransactorPublicKey ?? PLATFORM_WALLET,
    Metadata: "TransactorPublicKeyBase58Check",
  });

  return {
    Error: "",
    Transactions: [
      {
        TransactionIDBase58Check: "3JuEUXEx7uxvQoHd72SCQtdGG5pAEn5Gaw8Hvidf2seER6YG4RXzFX",
        TransactionHashHex: REAL_TX_HASH,
        TransactionType: overrides.TransactionType ?? "CREATOR_COIN_TRANSFER",
        BlockHashHex: overrides.BlockHashHex ?? BLOCK_HASH,
        TransactionMetadata: {
          TxnType:
            overrides.TransactionType ?? "CREATOR_COIN_TRANSFER",
          TransactorPublicKeyBase58Check:
            overrides.TransactorPublicKey ?? PLATFORM_WALLET,
          AffectedPublicKeys: affectedPublicKeys,
          TxnOutputs: null,
          BasicTransferTxindexMetadata: {
            TotalInputNanos: 201,
            TotalOutputNanos: 0,
            FeeNanos: 201,
          },
          CreatorCoinTransferTxindexMetadata: {
            CreatorUsername: overrides.CreatorUsername ?? "bitcoin",
            CreatorCoinToTransferNanos:
              overrides.CreatorCoinToTransferNanos ?? 455400,
            DiamondLevel: 0,
            PostHashHex: "",
          },
        },
      },
    ],
  };
}

function mockFetchOnce(payload: unknown) {
  vi.spyOn(global, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("verifyCreatorCoinTransfer — happy path", () => {
  it("returns ok:true for a valid creator coin transfer", async () => {
    mockFetchOnce(mockCctResponse());

    const result = await verifyCreatorCoinTransfer(
      REAL_TX_HASH,
      PLATFORM_WALLET,
      HOLDER_WALLET,
      "bitcoin",
      455400
    );

    expect(result).toEqual({
      ok: true,
      actualAmountNanos: 455400,
      blockHashHex: BLOCK_HASH,
    });
  });

  it("matches creator username case-insensitively", async () => {
    mockFetchOnce(mockCctResponse({ CreatorUsername: "BITCOIN" }));

    const result = await verifyCreatorCoinTransfer(
      REAL_TX_HASH,
      PLATFORM_WALLET,
      HOLDER_WALLET,
      "bitcoin",
      455400
    );

    expect(result.ok).toBe(true);
  });

  it("returns blockHashHex:null when on-chain block hash is empty", async () => {
    mockFetchOnce(mockCctResponse({ BlockHashHex: "" }));

    const result = await verifyCreatorCoinTransfer(
      REAL_TX_HASH,
      PLATFORM_WALLET,
      HOLDER_WALLET,
      "bitcoin",
      455400
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.blockHashHex).toBeNull();
    }
  });
});

describe("verifyCreatorCoinTransfer — input validation", () => {
  it("rejects hex shorter than 64 chars", async () => {
    const result = await verifyCreatorCoinTransfer(
      "abc123",
      PLATFORM_WALLET,
      HOLDER_WALLET,
      "bitcoin",
      455400
    );
    expect(result).toEqual({ ok: false, reason: "invalid-hex" });
  });

  it("rejects non-hex characters", async () => {
    const bad = "z".repeat(64);
    const result = await verifyCreatorCoinTransfer(
      bad,
      PLATFORM_WALLET,
      HOLDER_WALLET,
      "bitcoin",
      455400
    );
    expect(result).toEqual({ ok: false, reason: "invalid-hex" });
  });
});

describe("verifyCreatorCoinTransfer — DeSo API failures", () => {
  it("fails closed when fetch throws (network error)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(
      new Error("ECONNREFUSED")
    );

    const result = await verifyCreatorCoinTransfer(
      REAL_TX_HASH,
      PLATFORM_WALLET,
      HOLDER_WALLET,
      "bitcoin",
      455400
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("deso-api-unreachable");
    }
  });

  it("fails closed when DeSo returns HTTP 500", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("server error", { status: 500 })
    );

    const result = await verifyCreatorCoinTransfer(
      REAL_TX_HASH,
      PLATFORM_WALLET,
      HOLDER_WALLET,
      "bitcoin",
      455400
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("deso-api-unreachable");
    }
  });
});

describe("verifyCreatorCoinTransfer — on-chain mismatches", () => {
  it("returns tx-not-found when DeSo response is empty", async () => {
    mockFetchOnce(mockCctResponse({ Empty: true }));

    const result = await verifyCreatorCoinTransfer(
      REAL_TX_HASH,
      PLATFORM_WALLET,
      HOLDER_WALLET,
      "bitcoin",
      455400
    );

    expect(result).toEqual({ ok: false, reason: "tx-not-found" });
  });

  it("rejects BASIC_TRANSFER (DESO send, not creator coin)", async () => {
    mockFetchOnce(mockCctResponse({ TransactionType: "BASIC_TRANSFER" }));

    const result = await verifyCreatorCoinTransfer(
      REAL_TX_HASH,
      PLATFORM_WALLET,
      HOLDER_WALLET,
      "bitcoin",
      455400
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("tx-not-creator-coin-transfer");
    }
  });

  it("rejects when sender does not match", async () => {
    mockFetchOnce(
      mockCctResponse({
        TransactorPublicKey: "BC1YLgU3MCy5iBsKMHGrfdpZGGwJFEJhAXNmhCDMBFfDMBnCjc8hpNQ",
      })
    );

    const result = await verifyCreatorCoinTransfer(
      REAL_TX_HASH,
      PLATFORM_WALLET,
      HOLDER_WALLET,
      "bitcoin",
      455400
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("sender-mismatch");
    }
  });

  it("rejects when recipient not in AffectedPublicKeys", async () => {
    mockFetchOnce(mockCctResponse({ ReceiverPublicKey: null }));

    const result = await verifyCreatorCoinTransfer(
      REAL_TX_HASH,
      PLATFORM_WALLET,
      HOLDER_WALLET,
      "bitcoin",
      455400
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("recipient-not-found");
    }
  });

  it("rejects when AffectedPublicKeys entry has wrong Metadata", async () => {
    mockFetchOnce(
      mockCctResponse({ ReceiverMetadata: "TransactorPublicKeyBase58Check" })
    );

    const result = await verifyCreatorCoinTransfer(
      REAL_TX_HASH,
      PLATFORM_WALLET,
      HOLDER_WALLET,
      "bitcoin",
      455400
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("recipient-not-found");
    }
  });

  it("rejects when creator coin username does not match", async () => {
    mockFetchOnce(mockCctResponse({ CreatorUsername: "ethereum" }));

    const result = await verifyCreatorCoinTransfer(
      REAL_TX_HASH,
      PLATFORM_WALLET,
      HOLDER_WALLET,
      "bitcoin",
      455400
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("creator-username-mismatch");
    }
  });

  it("rejects when amount on-chain differs from expected", async () => {
    mockFetchOnce(mockCctResponse({ CreatorCoinToTransferNanos: 100000 }));

    const result = await verifyCreatorCoinTransfer(
      REAL_TX_HASH,
      PLATFORM_WALLET,
      HOLDER_WALLET,
      "bitcoin",
      455400
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("amount-mismatch");
    }
  });
});
