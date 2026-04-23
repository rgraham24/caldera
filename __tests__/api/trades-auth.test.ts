/**
 * P2-1.5 — authentication enforcement tests for trade routes.
 *
 * These test that the route handlers correctly require the
 * middleware-stamped x-deso-pubkey header and refuse unauthenticated
 * requests. They do NOT test the full trade flow end-to-end (that
 * would require Supabase + DeSo mocking far beyond this scope).
 *
 * The happy-path "authed request reaches the DB logic" case is
 * covered by asserting the 401 does NOT fire.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AUTH_HEADER } from "@/lib/auth";

// Mock everything downstream of the auth check. We only care that
// the route either (a) 401s when no header, or (b) proceeds past
// the auth check when the header is present.
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("@/lib/fees/relevantToken", () => ({
  resolveRelevantToken: vi.fn().mockResolvedValue({ token: "bitcoin", type: "crypto" }),
}));

vi.mock("@/lib/fees/holderSnapshot", () => ({
  snapshotHolders: vi.fn(),
}));

vi.mock("@/lib/deso/buyback", () => ({
  executeTokenBuyback: vi.fn(),
}));

import { POST as tradesPOST } from "@/app/api/trades/route";
import { POST as sellPOST } from "@/app/api/trades/sell/route";

const TEST_PK = "BC1YLgU3MCy5iBsKMHGrfdpZGGwJFEJhAXNmhCDMBFfDMBnCjc8hpNQ";

function makeReq(
  url: string,
  body: unknown,
  opts: { authed?: boolean } = {}
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (opts.authed) headers[AUTH_HEADER] = TEST_PK;

  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockFrom.mockReset();
});

describe("POST /api/trades — auth enforcement", () => {
  it("returns 401 when x-deso-pubkey header is absent", async () => {
    const req = makeReq(
      "http://localhost/api/trades",
      { marketId: "m1", side: "yes", amount: 1, txnHash: "tx1" },
      { authed: false }
    );
    const res = await tradesPOST(req as never);
    expect(res.status).toBe(401);
  });

  it("ignores desoPublicKey in body when header is absent — still 401", async () => {
    const req = makeReq(
      "http://localhost/api/trades",
      {
        marketId: "m1",
        side: "yes",
        amount: 1,
        txnHash: "tx1",
        desoPublicKey: TEST_PK,
      },
      { authed: false }
    );
    const res = await tradesPOST(req as never);
    expect(res.status).toBe(401);
  });

  it("passes auth check when x-deso-pubkey header is present", async () => {
    // Route will proceed past auth, then hit the Supabase mock which
    // returns nothing, leading to a downstream error. We only assert
    // the response is NOT 401.
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: { code: "PGRST116" } }),
        }),
      }),
      insert: () => ({
        select: () => ({ single: async () => ({ data: null, error: null }) }),
      }),
    }));

    const req = makeReq(
      "http://localhost/api/trades",
      { marketId: "m1", side: "yes", amount: 1, txnHash: "tx1" },
      { authed: true }
    );
    const res = await tradesPOST(req as never);
    // Anything but 401 is acceptable here — we just need to prove we
    // got past the auth gate.
    expect(res.status).not.toBe(401);
  });
});

describe("POST /api/trades/sell — auth enforcement", () => {
  it("returns 401 when x-deso-pubkey header is absent", async () => {
    const req = makeReq(
      "http://localhost/api/trades/sell",
      { marketId: "m1", side: "yes", shares: 5 },
      { authed: false }
    );
    const res = await sellPOST(req as never);
    expect(res.status).toBe(401);
  });

  it("ignores desoPublicKey in body when header is absent — still 401", async () => {
    const req = makeReq(
      "http://localhost/api/trades/sell",
      {
        marketId: "m1",
        side: "yes",
        shares: 5,
        desoPublicKey: TEST_PK,
      },
      { authed: false }
    );
    const res = await sellPOST(req as never);
    expect(res.status).toBe(401);
  });

  it("passes auth check when x-deso-pubkey header is present", async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: { code: "PGRST116" } }),
        }),
      }),
    }));

    const req = makeReq(
      "http://localhost/api/trades/sell",
      { marketId: "m1", side: "yes", shares: 5 },
      { authed: true }
    );
    const res = await sellPOST(req as never);
    expect(res.status).not.toBe(401);
  });
});
