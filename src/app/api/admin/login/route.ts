import { compare } from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { isAllowedAdminRequestOrigin } from "@/lib/admin/csrf";
import { loginRedirect } from "@/lib/admin/responses";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_MS,
  createAdminSessionToken,
} from "@/lib/admin/session";
import { clientIpFromHeaders, createLoginThrottle } from "@/lib/admin/throttle";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  password: z.string().min(1),
  next: z.string().max(512).optional(),
});

const loginThrottle = createLoginThrottle({
  limit: 5,
  windowMs: 15 * 60 * 1000,
});

function safeNextPath(value: string | undefined): string {
  if (
    value === undefined ||
    !value.startsWith("/admin") ||
    value.startsWith("/admin/login") ||
    value.startsWith("//")
  ) {
    return "/admin";
  }

  return value;
}

export async function POST(request: NextRequest) {
  if (!isAllowedAdminRequestOrigin(request)) {
    return loginRedirect(request, { error: "csrf" });
  }

  const ip = clientIpFromHeaders(request.headers);

  if (!loginThrottle.canAttempt(ip)) {
    return loginRedirect(request, { error: "throttled" });
  }

  const parsed = loginSchema.safeParse(
    Object.fromEntries(await request.formData()),
  );

  if (!parsed.success) {
    loginThrottle.recordFailure(ip);
    return loginRedirect(request, { error: "invalid" });
  }

  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;

  if (!passwordHash || !sessionSecret) {
    return loginRedirect(request, { error: "config" });
  }

  let passwordMatches = false;

  try {
    passwordMatches = await compare(parsed.data.password, passwordHash);
  } catch {
    return loginRedirect(request, { error: "config" });
  }

  if (!passwordMatches) {
    loginThrottle.recordFailure(ip);
    return loginRedirect(request, { error: "invalid" });
  }

  loginThrottle.reset(ip);

  const { token, expiresAt } = createAdminSessionToken(sessionSecret);
  const response = NextResponse.redirect(
    new URL(safeNextPath(parsed.data.next), request.url),
    303,
  );

  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
    maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
  });

  return response;
}
