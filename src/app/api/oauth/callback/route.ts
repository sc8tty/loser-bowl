import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { exchangeCodeForTokens } from "@/lib/yahoo/oauth";
import { storeTokens } from "@/lib/yahoo/tokens";

export const dynamic = "force-dynamic";

function stateMatches(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);

  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Sends the browser to an UNGUARDED result page rather than straight to /admin.
 * The admin session cookie is sameSite=strict, and the browser withholds it for
 * every hop of a redirect chain a cross-site page began — so landing directly on
 * /admin from Yahoo bounces to the login screen and loses the result.
 */
function donePage(request: NextRequest, status: string): NextResponse {
  const url = new URL("/oauth/done", request.url);
  url.searchParams.set("status", status);

  return NextResponse.redirect(url, 303);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  if (url.searchParams.has("error")) {
    return donePage(request, "denied");
  }

  const state = url.searchParams.get("state");
  const cookieState = request.cookies.get("yahoo_oauth_state")?.value;

  if (
    state === null ||
    cookieState === undefined ||
    !stateMatches(state, cookieState)
  ) {
    return donePage(request, "state");
  }

  const code = url.searchParams.get("code");

  if (!code) {
    return donePage(request, "code");
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await storeTokens({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    });

    const response = donePage(request, "connected");

    response.cookies.set({
      name: "yahoo_oauth_state",
      value: "",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
      maxAge: 0,
    });

    return response;
  } catch (error) {
    // The redirect can only carry an opaque code, so without this the one-time
    // authorization failure leaves nothing to diagnose. Messages from oauth.ts
    // are already sanitized to status + Yahoo's error_description.
    console.error(
      `Yahoo OAuth code exchange failed: ${error instanceof Error ? error.message : String(error)}`,
    );

    return donePage(request, "exchange");
  }
}
