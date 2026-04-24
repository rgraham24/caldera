/**
 * P2-3 — Rate limit primitive using Upstash Redis.
 *
 * Callers:
 *   import { checkRateLimit } from "@/lib/rate-limit";
 *   const rl = await checkRateLimit(`trades:${publicKey}`, "trades");
 *   if (!rl.allowed) return new Response("Too Many Requests", { status: 429 });
 *
 * Fails OPEN: if Upstash is unreachable or env vars are missing, we
 * return allowed=true with a logged warning. Rate limiting is DoS
 * defense, not a security boundary. Inverse of verifyTx's fail-closed.
 *
 * See docs/P2-3-rate-limit-design.md for full design rationale.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { RATE_LIMIT_CONFIGS, type RateLimitConfigName } from "./config";

export type RateLimitCheckResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;   // epoch ms
};

// ─── Internal: lazy Upstash client + per-config Ratelimit ────────
//
// We instantiate lazily so:
//   (a) Missing env vars don't crash at module load — checkRateLimit
//       returns fail-open instead.
//   (b) Tests can mock before first use.

let _redis: Redis | null = null;
let _limiters: Partial<Record<RateLimitConfigName, Ratelimit>> = {};
let _missingEnvLogged = false;

function getRedis(): Redis | null {
  if (_redis) return _redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (!_missingEnvLogged) {
      console.error(
        "[rate-limit] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN missing — rate limiting disabled (fail-open)"
      );
      _missingEnvLogged = true;
    }
    return null;
  }

  _redis = new Redis({ url, token });
  return _redis;
}

function getLimiter(config: RateLimitConfigName): Ratelimit | null {
  const existing = _limiters[config];
  if (existing) return existing;

  const redis = getRedis();
  if (!redis) return null;

  const { limit, windowSeconds } = RATE_LIMIT_CONFIGS[config];
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    analytics: false,
    prefix: `rl:${config}`,
  });
  _limiters[config] = limiter;
  return limiter;
}

// ─── Public API ─────────────────────────────────────────────────

export async function checkRateLimit(
  bucketKey: string,
  config: RateLimitConfigName
): Promise<RateLimitCheckResult> {
  // Reject unknown configs loudly — this is a programmer error, not
  // a runtime concern. (TS catches most of these at compile time.)
  if (!(config in RATE_LIMIT_CONFIGS)) {
    throw new Error(`Unknown rate limit config: ${config}`);
  }

  const limiter = getLimiter(config);
  if (!limiter) {
    // Fail open on missing env / Upstash init failure.
    return failOpen();
  }

  try {
    const result = await limiter.limit(bucketKey);
    return {
      allowed: result.success,
      remaining: result.remaining,
      resetAt: result.reset,
    };
  } catch (e) {
    console.error(
      "[rate-limit] Upstash call failed — fail-open",
      { bucketKey, config, error: e instanceof Error ? e.message : String(e) }
    );
    return failOpen();
  }
}

function failOpen(): RateLimitCheckResult {
  return {
    allowed: true,
    remaining: Number.POSITIVE_INFINITY,
    resetAt: Date.now(),
  };
}

/**
 * TEST-ONLY: reset the module's internal state. Call from afterEach()
 * so tests that mock env vars or Upstash don't pollute each other.
 */
export function __resetRateLimitStateForTests(): void {
  _redis = null;
  _limiters = {};
  _missingEnvLogged = false;
}
