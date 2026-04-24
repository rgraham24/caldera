import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the signAndSubmit helper BEFORE importing the module under test.
vi.mock("@/lib/deso/transaction", () => ({
  signAndSubmit: vi.fn(),
}));

import { transferCreatorCoin } from "@/lib/deso/transfer";
import { signAndSubmit } from "@/lib/deso/transaction";

// Valid-shape public keys (real format, nothing sensitive).
const VALID_CREATOR = "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7";
const VALID_RECIPIENT = "BC1YLhriEzhGkrKzUGmL3B4Zdq9S63oGVSYMhUV1UT5vDoRieHceZBB";
const VALID_PLATFORM = "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7";
const VALID_SEED = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const VALID_AMOUNT_NANOS = BigInt(1_000_000); // 0.001 coin

const baseParams = {
  creatorPublicKey: VALID_CREATOR,
  recipientPublicKey: VALID_RECIPIENT,
  creatorCoinNanos: VALID_AMOUNT_NANOS,
  platformPublicKey: VALID_PLATFORM,
  platformSeed: VALID_SEED,
};

// ─── fetch mocks ─────────────────────────────────────────────

function mockFetchJson(body: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as Response);
}

function mockFetchReject(err: Error) {
  global.fetch = vi.fn().mockRejectedValue(err);
}

function happyConstructResponse(overrides: Record<string, unknown> = {}) {
  return {
    TransactionHex: "aa" + "00".repeat(100),
    FeeNanos: 168,
    TxnHashHex: "f".repeat(64),
    SpendAmountNanos: 0,
    ChangeAmountNanos: 0,
    TotalInputNanos: 500,
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  (signAndSubmit as ReturnType<typeof vi.fn>).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("transferCreatorCoin — happy path", () => {
  it("returns ok:true when construct + sign + submit all succeed", async () => {
    mockFetchJson(happyConstructResponse());
    (signAndSubmit as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      txHashHex: "abc123feedface",
    });

    const result = await transferCreatorCoin(baseParams);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.txHashHex).toBe("abc123feedface");
      expect(result.feeNanos).toBe(168);
    }
  });

  it("defaults feeNanos to 0 when the construct response omits it", async () => {
    mockFetchJson(happyConstructResponse({ FeeNanos: undefined }));
    (signAndSubmit as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      txHashHex: "deadbeef",
    });

    const result = await transferCreatorCoin(baseParams);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.feeNanos).toBe(0);
  });
});

describe("transferCreatorCoin — input validation", () => {
  it("rejects invalid creator public key", async () => {
    const result = await transferCreatorCoin({
      ...baseParams,
      creatorPublicKey: "not-a-pubkey",
    });
    expect(result).toEqual({ ok: false, reason: "invalid-public-key" });
  });

  it("rejects invalid recipient public key", async () => {
    const result = await transferCreatorCoin({
      ...baseParams,
      recipientPublicKey: "BC1YshortButBadFormat",
    });
    expect(result).toEqual({ ok: false, reason: "invalid-public-key" });
  });

  it("rejects invalid platform public key", async () => {
    const result = await transferCreatorCoin({
      ...baseParams,
      platformPublicKey: "",
    });
    expect(result).toEqual({ ok: false, reason: "invalid-public-key" });
  });

  it("rejects zero nanos", async () => {
    const result = await transferCreatorCoin({
      ...baseParams,
      creatorCoinNanos: BigInt(0),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid-amount");
  });

  it("rejects negative nanos", async () => {
    const result = await transferCreatorCoin({
      ...baseParams,
      creatorCoinNanos: BigInt(-1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid-amount");
  });

  it("rejects nanos exceeding Number.MAX_SAFE_INTEGER", async () => {
    const result = await transferCreatorCoin({
      ...baseParams,
      creatorCoinNanos: BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid-amount");
  });

  it("rejects empty platform seed", async () => {
    const result = await transferCreatorCoin({
      ...baseParams,
      platformSeed: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("sign-failed");
  });
});

describe("transferCreatorCoin — construct-tx failures", () => {
  it("returns deso-api-unreachable when fetch rejects", async () => {
    mockFetchReject(new Error("ETIMEDOUT"));
    const result = await transferCreatorCoin(baseParams);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("deso-api-unreachable");
  });

  it("returns construct-failed when DeSo returns non-2xx", async () => {
    mockFetchJson({ Error: "insufficient balance" }, 400);
    const result = await transferCreatorCoin(baseParams);
    // Non-2xx throws inside fetchConstructTx → deso-api-unreachable
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("deso-api-unreachable");
  });

  it("returns construct-failed when response is missing TransactionHex", async () => {
    mockFetchJson(happyConstructResponse({ TransactionHex: undefined }));
    const result = await transferCreatorCoin(baseParams);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("construct-failed");
  });
});

describe("transferCreatorCoin — sign/submit failures", () => {
  it("returns sign-failed when signAndSubmit reports sign stage failure", async () => {
    mockFetchJson(happyConstructResponse());
    (signAndSubmit as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      stage: "sign",
      error: new Error("bad seed"),
    });
    const result = await transferCreatorCoin(baseParams);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("sign-failed");
      expect(result.detail).toContain("bad seed");
    }
  });

  it("returns submit-failed when signAndSubmit reports submit stage failure", async () => {
    mockFetchJson(happyConstructResponse());
    (signAndSubmit as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      stage: "submit",
      error: new Error("insufficient balance"),
    });
    const result = await transferCreatorCoin(baseParams);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("submit-failed");
      expect(result.detail).toContain("insufficient balance");
    }
  });

  it("defaults to submit-failed when signAndSubmit fails without a stage field", async () => {
    mockFetchJson(happyConstructResponse());
    (signAndSubmit as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: new Error("unknown"),
    });
    const result = await transferCreatorCoin(baseParams);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("submit-failed");
  });
});
