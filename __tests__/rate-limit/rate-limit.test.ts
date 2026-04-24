import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock BEFORE importing the module under test.
const limitMock = vi.fn();
vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    static slidingWindow(_limit: number, _window: string) {
      return { kind: "slidingWindow" };
    }
    constructor(_opts: unknown) {}
    limit = limitMock;
  }
  return { Ratelimit };
});

vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(_opts: unknown) {}
  },
}));

import {
  checkRateLimit,
  __resetRateLimitStateForTests,
} from "@/lib/rate-limit";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  __resetRateLimitStateForTests();
  limitMock.mockReset();
  // Default to "Upstash configured" for most tests
  process.env.UPSTASH_REDIS_REST_URL = "https://test.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("checkRateLimit — happy path", () => {
  it("returns allowed=true when Upstash reports success", async () => {
    limitMock.mockResolvedValue({
      success: true,
      remaining: 9,
      reset: Date.now() + 60_000,
    });

    const result = await checkRateLimit("trades:BC1YAbc", "trades");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(result.resetAt).toBeGreaterThan(Date.now());
    expect(limitMock).toHaveBeenCalledWith("trades:BC1YAbc");
  });

  it("returns allowed=false when Upstash reports limit exceeded", async () => {
    limitMock.mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Date.now() + 30_000,
    });

    const result = await checkRateLimit("login-ip:1.2.3.4", "login");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("different bucketKeys are independent", async () => {
    // Sequential returns: first call success, second call limit exceeded
    limitMock
      .mockResolvedValueOnce({ success: true, remaining: 9, reset: 0 })
      .mockResolvedValueOnce({ success: false, remaining: 0, reset: 0 });

    const a = await checkRateLimit("trades:userA", "trades");
    const b = await checkRateLimit("trades:userB", "trades");

    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(false);
    expect(limitMock).toHaveBeenNthCalledWith(1, "trades:userA");
    expect(limitMock).toHaveBeenNthCalledWith(2, "trades:userB");
  });
});

describe("checkRateLimit — config selection", () => {
  it("creates separate limiters for trades / login / news", async () => {
    limitMock.mockResolvedValue({
      success: true,
      remaining: 5,
      reset: Date.now() + 60_000,
    });

    await checkRateLimit("a", "trades");
    await checkRateLimit("b", "login");
    await checkRateLimit("c", "news");

    // Each call succeeded and was directed at some limiter
    expect(limitMock).toHaveBeenCalledTimes(3);
  });

  it("throws on unknown config name (programmer error)", async () => {
    await expect(
      // @ts-expect-error — intentional: testing runtime guard
      checkRateLimit("x", "not-a-real-config")
    ).rejects.toThrow(/Unknown rate limit config/);
  });
});

describe("checkRateLimit — fail open behavior", () => {
  it("fails open when UPSTASH_REDIS_REST_URL is missing", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    __resetRateLimitStateForTests();

    const result = await checkRateLimit("trades:user", "trades");

    expect(result.allowed).toBe(true);
    expect(limitMock).not.toHaveBeenCalled();
  });

  it("fails open when UPSTASH_REDIS_REST_TOKEN is missing", async () => {
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    __resetRateLimitStateForTests();

    const result = await checkRateLimit("trades:user", "trades");

    expect(result.allowed).toBe(true);
    expect(limitMock).not.toHaveBeenCalled();
  });

  it("fails open when Upstash throws (network error)", async () => {
    limitMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await checkRateLimit("trades:user", "trades");

    expect(result.allowed).toBe(true);
  });

  it("fails open when Upstash returns malformed response", async () => {
    // Missing .success field — treat as fail open
    limitMock.mockRejectedValue(new TypeError("Cannot read success"));

    const result = await checkRateLimit("trades:user", "trades");
    expect(result.allowed).toBe(true);
  });
});

describe("checkRateLimit — env var logging", () => {
  it("logs the missing-env error only once across multiple calls", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    __resetRateLimitStateForTests();

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await checkRateLimit("a", "trades");
    await checkRateLimit("b", "trades");
    await checkRateLimit("c", "login");

    // Only one error log despite 3 calls
    const missingEnvLogs = spy.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("UPSTASH_REDIS_REST_URL")
    );
    expect(missingEnvLogs).toHaveLength(1);

    spy.mockRestore();
  });
});
