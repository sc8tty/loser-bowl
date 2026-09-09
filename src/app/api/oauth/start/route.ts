import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { isAdminRequestAuthenticated } from "@/lib/admin/guard";
import { loginRedirect } from "@/lib/admin/responses";
import { buildAuthorizeUrl } from "@/lib/yahoo/oauth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdminRequestAuthenticated(request)) {
    return loginRedirect(request, { error: "expired" });
  }

  const state = randomBytes(16).toString("base64url");
  const response = NextResponse.redirect(buildAuthorizeUrl(state), 302);

  response.cookies.set({
    name: "yahoo_oauth_state",
    value: state,
    httpOnly: true,
    secure: true,
    // Lax lets Yahoo's cross-site callback send the nonce cookie.
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return response;
}
