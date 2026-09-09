import { timingSafeEqual } from "node:crypto";

import { type NextRequest } from "next/server";

import { adminRedirect } from "@/lib/admin/responses";
import { exchangeCodeForTokens } from "@/lib/yahoo/oauth";
import { storeTokens } from "@/lib/yahoo/tokens";

export const dynamic = "force-dynamic";

function stateMatches(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);

  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  if (url.searchParams.has("error")) {
    return adminRedirect(request, { error: "yahoo_denied" });
  }

  const state = url.searchParams.get("state");
  const cookieState = request.cookies.get("yahoo_oauth_state")?.value;

  if (
    state === null ||
    cookieState === undefined ||
    !stateMatches(state, cookieState)
  ) {
    return adminRedirect(request, { error: "yahoo_state" });
  }

  const code = url.searchParams.get("code");

  if (!code) {
    return adminRedirect(request, { error: "yahoo_code" });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await storeTokens({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    });

    const response = adminRedirect(request, { notice: "yahoo_connected" });

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

    return adminRedirect(request, { error: "yahoo_exchange" });
  }
}
