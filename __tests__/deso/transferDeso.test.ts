import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock signAndSubmit BEFORE importing transferDeso
vi.mock("@/lib/deso/transaction", () => ({
  signAndSubmit: vi.fn(),
}));

// Mock global fetch
const mockedFetch = vi.fn();
vi.stubGlobal("fetch", mockedFetch);

import { transferDeso } from "@/lib/deso/transferDeso";
import { signAndSubmit } from "@/lib/deso/transaction";

const mockedSign = signAndSubmit as ReturnType<typeof vi.fn>;

const PLATFORM_PK = "BC1YLPLATFORMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const PLATFORM_SEED = "ab".repeat(64);
const RECIPIENT = "BC1YLhriEzhGkrKzUGmL3B4Zdq9S63oGVSYMhUV1UT5vDoRieHceZBB";

beforeEach(() => {
  mockedFetch.mockReset();
  mockedSign.mockReset();
});

describe("transferDeso", () => {
  it("happy path: builds, signs, returns ok with txHashHex", async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ TransactionHex: "abc123", FeeNanos: 168 }),
    });
    mockedSign.mockResolvedValue({
      success: true,
      txHashHex: "deadbeef",
    });

    const result = await transferDeso({
      recipientPublicKey: RECIPIENT,
      amountNanos: BigInt(100_000),
      platformPublicKey: PLATFORM_PK,
      platformSeed: PLATFORM_SEED,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.txHashHex).toBe("deadbeef");
      expect(result.feeNanos).toBe(BigInt(168));
    }
  });

  it("rejects amountNanos < 1", async () => {
    const result = await transferDeso({
      recipientPublicKey: RECIPIENT,
      amountNanos: BigInt(0),
      platformPublicKey: PLATFORM_PK,
      platformSeed: PLATFORM_SEED,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("build-failed");
      expect(result.detail).toMatch(/amountNanos must be >= 1/);
    }
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(mockedSign).not.toHaveBeenCalled();
  });

  it("returns build-failed when DeSo API returns non-2xx", async () => {
    mockedFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "internal server error",
    });

    const result = await transferDeso({
      recipientPublicKey: RECIPIENT,
      amountNanos: BigInt(100_000),
      platformPublicKey: PLATFORM_PK,
      platformSeed: PLATFORM_SEED,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("build-failed");
      expect(result.detail).toMatch(/500/);
    }
    expect(mockedSign).not.toHaveBeenCalled();
  });

  it("returns build-failed when response missing TransactionHex", async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ /* no TransactionHex */ }),
    });

    const result = await transferDeso({
      recipientPublicKey: RECIPIENT,
      amountNanos: BigInt(100_000),
      platformPublicKey: PLATFORM_PK,
      platformSeed: PLATFORM_SEED,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("build-failed");
      expect(result.detail).toMatch(/missing TransactionHex/);
    }
  });

  it("returns build-failed on network error", async () => {
    mockedFetch.mockRejectedValue(new Error("network down"));

    const result = await transferDeso({
      recipientPublicKey: RECIPIENT,
      amountNanos: BigInt(100_000),
      platformPublicKey: PLATFORM_PK,
      platformSeed: PLATFORM_SEED,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("build-failed");
      expect(result.detail).toBe("network down");
    }
    expect(mockedSign).not.toHaveBeenCalled();
  });

  it("returns submit-failed when signAndSubmit fails at submit stage", async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ TransactionHex: "abc123", FeeNanos: 168 }),
    });
    mockedSign.mockResolvedValue({
      success: false,
      stage: "submit",
      error: "DeSo network rejected: insufficient fees",
    });

    const result = await transferDeso({
      recipientPublicKey: RECIPIENT,
      amountNanos: BigInt(100_000),
      platformPublicKey: PLATFORM_PK,
      platformSeed: PLATFORM_SEED,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("submit-failed");
      expect(result.detail).toMatch(/insufficient fees/);
    }
  });

  it("returns build-failed when signAndSubmit fails at sign stage", async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ TransactionHex: "abc123", FeeNanos: 168 }),
    });
    mockedSign.mockResolvedValue({
      success: false,
      stage: "sign",
      error: "bad seed",
    });

    const result = await transferDeso({
      recipientPublicKey: RECIPIENT,
      amountNanos: BigInt(100_000),
      platformPublicKey: PLATFORM_PK,
      platformSeed: PLATFORM_SEED,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("build-failed");
      expect(result.detail).toMatch(/bad seed/);
    }
  });

  it("calls DeSo API with correct payload shape", async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ TransactionHex: "abc123", FeeNanos: 168 }),
    });
    mockedSign.mockResolvedValue({
      success: true,
      txHashHex: "deadbeef",
    });

    await transferDeso({
      recipientPublicKey: RECIPIENT,
      amountNanos: BigInt(100_000),
      platformPublicKey: PLATFORM_PK,
      platformSeed: PLATFORM_SEED,
    });

    const call = mockedFetch.mock.calls[0];
    expect(call[0]).toMatch(/api\/v0\/send-deso$/);
    const body = JSON.parse(call[1].body);
    expect(body).toEqual({
      SenderPublicKeyBase58Check: PLATFORM_PK,
      RecipientPublicKeyOrUsername: RECIPIENT,
      AmountNanos: 100_000,
      MinFeeRateNanosPerKB: 1000,
    });
  });

  it("calls signAndSubmit with the txHex from build response", async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ TransactionHex: "abc123", FeeNanos: 168 }),
    });
    mockedSign.mockResolvedValue({
      success: true,
      txHashHex: "deadbeef",
    });

    await transferDeso({
      recipientPublicKey: RECIPIENT,
      amountNanos: BigInt(100_000),
      platformPublicKey: PLATFORM_PK,
      platformSeed: PLATFORM_SEED,
    });

    expect(mockedSign).toHaveBeenCalledWith("abc123", PLATFORM_SEED);
  });

  it("converts BigInt amountNanos to Number for DeSo API", async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ TransactionHex: "abc123", FeeNanos: 168 }),
    });
    mockedSign.mockResolvedValue({
      success: true,
      txHashHex: "deadbeef",
    });

    await transferDeso({
      recipientPublicKey: RECIPIENT,
      amountNanos: BigInt(1_234_567),
      platformPublicKey: PLATFORM_PK,
      platformSeed: PLATFORM_SEED,
    });

    const body = JSON.parse(mockedFetch.mock.calls[0][1].body);
    expect(body.AmountNanos).toBe(1_234_567);
    expect(typeof body.AmountNanos).toBe("number");
  });
});
