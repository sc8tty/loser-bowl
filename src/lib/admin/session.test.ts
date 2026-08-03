import { describe, expect, it } from "vitest";

import { createAdminSessionToken, verifyAdminSessionToken } from "./session";

describe("admin session tokens", () => {
  const secret = "test-secret-with-enough-entropy";
  const now = new Date("2026-08-02T12:00:00.000Z");

  it("verifies a freshly signed token", () => {
    const { token } = createAdminSessionToken(secret, now, "fixed-nonce");

    expect(verifyAdminSessionToken(token, secret, now)).toBe(true);
  });

  it("rejects a token with a different signing secret", () => {
    const { token } = createAdminSessionToken(secret, now, "fixed-nonce");

    expect(verifyAdminSessionToken(token, "different-secret", now)).toBe(false);
  });

  it("rejects tampered payloads", () => {
    const { token } = createAdminSessionToken(secret, now, "fixed-nonce");
    const [payload, signature] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        sub: "admin",
        iat: 0,
        exp: 9999999999,
        nonce: "fixed-nonce",
      }),
    ).toString("base64url");

    expect(
      verifyAdminSessionToken(`${tamperedPayload}.${signature}`, secret, now),
    ).toBe(false);
    expect(payload).not.toBe(tamperedPayload);
  });

  it("rejects expired tokens", () => {
    const { token } = createAdminSessionToken(secret, now, "fixed-nonce");
    const eightDaysLater = new Date("2026-08-10T12:00:00.000Z");

    expect(verifyAdminSessionToken(token, secret, eightDaysLater)).toBe(false);
  });
});
