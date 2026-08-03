import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "loser_bowl_admin_session";
export const ADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type SessionPayload = {
  sub: "admin";
  iat: number;
  exp: number;
  nonce: string;
};

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
}

function decodePayload(payload: string): SessionPayload | null {
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

    if (
      decoded?.sub !== "admin" ||
      typeof decoded.iat !== "number" ||
      typeof decoded.exp !== "number" ||
      typeof decoded.nonce !== "string"
    ) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

export function createAdminSessionToken(
  secret: string,
  now = new Date(),
  nonce = randomBytes(16).toString("base64url"),
): { token: string; expiresAt: Date } {
  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_TTL_MS);
  const payload: SessionPayload = {
    sub: "admin",
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(expiresAt.getTime() / 1000),
    nonce,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signPayload(encodedPayload, secret);

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt,
  };
}

export function verifyAdminSessionToken(
  token: string | undefined,
  secret: string | undefined,
  now = new Date(),
): boolean {
  if (!token || !secret) {
    return false;
  }

  const parts = token.split(".");

  if (parts.length !== 2) {
    return false;
  }

  const [encodedPayload, signature] = parts;
  const expected = signPayload(encodedPayload, secret);

  if (!safeEqual(signature, expected)) {
    return false;
  }

  const payload = decodePayload(encodedPayload);

  if (payload === null) {
    return false;
  }

  return payload.exp * 1000 > now.getTime();
}
