import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
} from "./oauth";

const ORIGINAL_ENV = {
  YAHOO_CLIENT_ID: process.env.YAHOO_CLIENT_ID,
  YAHOO_CLIENT_SECRET: process.env.YAHOO_CLIENT_SECRET,
  YAHOO_REDIRECT_URI: process.env.YAHOO_REDIRECT_URI,
};

function setYahooEnv() {
  process.env.YAHOO_CLIENT_ID = "client-id";
  process.env.YAHOO_CLIENT_SECRET = "super-secret";
  process.env.YAHOO_REDIRECT_URI = "https://example.com/api/oauth/callback";
}

function restoreEnv(key: keyof typeof ORIGINAL_ENV) {
  const value = ORIGINAL_ENV[key];

  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  restoreEnv("YAHOO_CLIENT_ID");
  restoreEnv("YAHOO_CLIENT_SECRET");
  restoreEnv("YAHOO_REDIRECT_URI");
});

describe("Yahoo OAuth", () => {
  it("builds the authorization URL with the required params", () => {
    setYahooEnv();

    const url = buildAuthorizeUrl("state-value");

    expect(`${url.origin}${url.pathname}`).toBe(
      "https://api.login.yahoo.com/oauth2/request_auth",
    );
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://example.com/api/oauth/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("fspt-r");
    expect(url.searchParams.get("state")).toBe("state-value");
  });

  it("throws a sanitized token-exchange error without leaking the secret", async () => {
    setYahooEnv();
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "bad authorization code",
        }),
        { status: 401 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeCodeForTokens("bad-code")).rejects.toThrow(
      "Yahoo OAuth token request failed with status 401: invalid_grant: bad authorization code",
    );

    try {
      await exchangeCodeForTokens("bad-code");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const message = error instanceof Error ? error.message : "";

      expect(message).not.toContain("super-secret");
      expect(message).not.toContain("bad-code");
      expect(message).not.toContain("authorization_code");
    }
  });

  it("includes redirect_uri on refresh token requests", async () => {
    setYahooEnv();
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          access_token: "fresh-access",
          expires_in: 3600,
          token_type: "bearer",
          xoauth_yahoo_guid: "guid",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await refreshAccessToken("old-refresh");

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(URLSearchParams);

    const body =
      init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();

    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("old-refresh");
    expect(body.get("redirect_uri")).toBe(
      "https://example.com/api/oauth/callback",
    );
  });
});
