import { describe, it, expect } from "vitest";
import { signCookie, verifyCookie, type SessionPayload } from "@/lib/auth/cookie";

const KEY = "dK7n2FhG9pQ8_wR3sLpY5vKmXtZ4bC1eN6oUjH0aI2M";
const OTHER_KEY = "pZ9f3GxK8hL2_mN4sTqW7vBdEj5cR1aY6uIiF0oX9E8";
const SHORT_KEY = "abcdef";

const futureExp = (): number => Math.floor(Date.now() / 1000) + 3600;
const pastExp = (): number => Math.floor(Date.now() / 1000) - 3600;

const validPayload: SessionPayload = {
  publicKey: "BC1YLgU3MCy5iBsKMHGrfdpZGGwJFEJhAXNmhCDMBFfDMBnCjc8hpNQ",
  iat: Math.floor(Date.now() / 1000),
  exp: futureExp(),
};

describe("signCookie", () => {
  it("produces a cookie string with exactly one dot", () => {
    const c = signCookie(validPayload, KEY);
    expect(typeof c).toBe("string");
    expect(c.split(".").length).toBe(2);
  });

  it("throws when signing key is missing", () => {
    expect(() => signCookie(validPayload, "")).toThrow(/missing/i);
  });

  it("throws when signing key is too short", () => {
    expect(() => signCookie(validPayload, SHORT_KEY)).toThrow(/at least 32 bytes/i);
  });
});

describe("verifyCookie — happy path", () => {
  it("round-trips a valid payload", async () => {
    const c = signCookie(validPayload, KEY);
    const parsed = await verifyCookie(c, KEY);
    expect(parsed).not.toBeNull();
    expect(parsed?.publicKey).toBe(validPayload.publicKey);
    expect(parsed?.iat).toBe(validPayload.iat);
    expect(parsed?.exp).toBe(validPayload.exp);
  });
});

describe("verifyCookie — failures", () => {
  it("returns null when the cookie is empty", async () => {
    expect(await verifyCookie("", KEY)).toBeNull();
  });

  it("returns null when there is no dot separator", async () => {
    expect(await verifyCookie("abc123", KEY)).toBeNull();
  });

  it("returns null when there are too many dots", async () => {
    expect(await verifyCookie("a.b.c", KEY)).toBeNull();
  });

  it("returns null when either half is empty", async () => {
    expect(await verifyCookie(".payload", KEY)).toBeNull();
    expect(await verifyCookie("mac.", KEY)).toBeNull();
  });

  it("returns null when base64url decoding fails", async () => {
    expect(await verifyCookie("!!!.###", KEY)).toBeNull();
  });

  it("returns null when payload is not JSON", async () => {
    const garbage = Buffer.from("not json at all", "utf8").toString("base64url");
    const { createHmac } = require("node:crypto");
    const mac = createHmac("sha256", KEY).update(garbage).digest().toString("base64url");
    expect(await verifyCookie(`${mac}.${garbage}`, KEY)).toBeNull();
  });

  it("returns null when MAC is tampered with", async () => {
    const c = signCookie(validPayload, KEY);
    const [mac, payload] = c.split(".");
    const flipped = (mac[0] === "A" ? "B" : "A") + mac.slice(1);
    expect(await verifyCookie(`${flipped}.${payload}`, KEY)).toBeNull();
  });

  it("returns null when payload is tampered with", async () => {
    const c = signCookie(validPayload, KEY);
    const [mac, payload] = c.split(".");
    const flipped = (payload[0] === "A" ? "B" : "A") + payload.slice(1);
    expect(await verifyCookie(`${mac}.${flipped}`, KEY)).toBeNull();
  });

  it("returns null when signing key differs from verification key", async () => {
    const c = signCookie(validPayload, KEY);
    expect(await verifyCookie(c, OTHER_KEY)).toBeNull();
  });

  it("returns null when payload is expired", async () => {
    const expired: SessionPayload = { ...validPayload, exp: pastExp() };
    const c = signCookie(expired, KEY);
    expect(await verifyCookie(c, KEY)).toBeNull();
  });

  it("returns null when publicKey field is missing", async () => {
    const bad = { iat: validPayload.iat, exp: validPayload.exp };
    const badJson = JSON.stringify(bad);
    const badB64 = Buffer.from(badJson, "utf8").toString("base64url");
    const { createHmac } = require("node:crypto");
    const mac = createHmac("sha256", KEY).update(badB64).digest().toString("base64url");
    expect(await verifyCookie(`${mac}.${badB64}`, KEY)).toBeNull();
  });

  it("returns null when iat/exp are not numbers", async () => {
    const bad = { publicKey: "BC1...", iat: "nope", exp: "nope" };
    const badJson = JSON.stringify(bad);
    const badB64 = Buffer.from(badJson, "utf8").toString("base64url");
    const { createHmac } = require("node:crypto");
    const mac = createHmac("sha256", KEY).update(badB64).digest().toString("base64url");
    expect(await verifyCookie(`${mac}.${badB64}`, KEY)).toBeNull();
  });
});
