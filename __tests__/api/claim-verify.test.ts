import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock verifyFreshDesoJwt
vi.mock("@/lib/auth/deso-jwt", () => ({
  verifyFreshDesoJwt: vi.fn(),
}));

// Mock supabase server client
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    })),
  })),
}));

import { POST } from "@/app/api/claim/verify/route";
import { verifyFreshDesoJwt } from "@/lib/auth/deso-jwt";

const PUBKEY = "BC1YLjFkekgEqyLsghWfhHpJidmyanfa3cvxxA933EgVDu9YuaAwaH7";

const mockedFresh = verifyFreshDesoJwt as ReturnType<typeof vi.fn>;

function makeReq(body: unknown) {
  return new Request("http://localhost/api/claim/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

beforeEach(() => {
  mockedFresh.mockReset();
});

describe("POST /api/claim/verify — P2-5.4 fresh-JWT auth", () => {
  it("returns 401 when desoJwt is missing", async () => {
    const req = makeReq({
      code: "CALDERA-A1B2-C3D4",
      desoPublicKey: PUBKEY,
      desoUsername: "matthilton",
      handle: "matt",
    });

    const res = await POST(req as never);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.reason).toBe("missing-jwt");
  });

  it("returns 401 when desoPublicKey is missing", async () => {
    const req = makeReq({
      code: "CALDERA-A1B2-C3D4",
      desoJwt: "header.payload.sig",
      desoUsername: "matthilton",
      handle: "matt",
    });

    const res = await POST(req as never);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.reason).toBe("missing-pubkey");
  });

  it("returns 401 when JWT signature is invalid", async () => {
    mockedFresh.mockResolvedValue({ ok: false, reason: "invalid-jwt" });
    const req = makeReq({
      code: "CALDERA-A1B2-C3D4",
      desoJwt: "bad.jwt.sig",
      desoPublicKey: PUBKEY,
    });

    const res = await POST(req as never);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.reason).toBe("invalid-jwt");
  });

  it("returns 401 when JWT is stale", async () => {
    mockedFresh.mockResolvedValue({ ok: false, reason: "stale" });
    const req = makeReq({
      code: "CALDERA-A1B2-C3D4",
      desoJwt: "stale.jwt.sig",
      desoPublicKey: PUBKEY,
    });

    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it("returns 401 when derived key is invalid (DeSo binding fails)", async () => {
    mockedFresh.mockResolvedValue({ ok: false, reason: "derived-key-invalid" });
    const req = makeReq({
      code: "CALDERA-A1B2-C3D4",
      desoJwt: "valid.but.unbound.sig",
      desoPublicKey: PUBKEY,
    });

    const res = await POST(req as never);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.reason).toBe("derived-key-invalid");
  });

  it("calls verifyFreshDesoJwt with the body's desoPublicKey", async () => {
    mockedFresh.mockResolvedValue({ ok: true, publicKey: PUBKEY });
    const req = makeReq({
      code: "CALDERA-A1B2-C3D4",
      desoJwt: "valid.jwt.sig",
      desoPublicKey: PUBKEY,
      desoUsername: "matthilton",
      handle: "matt",
    });

    await POST(req as never);

    expect(mockedFresh).toHaveBeenCalledWith("valid.jwt.sig", PUBKEY);
  });
});
