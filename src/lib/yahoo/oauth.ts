import { getYahooConfig } from "./config";

const AUTHORIZE_URL = "https://api.login.yahoo.com/oauth2/request_auth";
const TOKEN_URL = "https://api.login.yahoo.com/oauth2/get_token";
export const YAHOO_FANTASY_SCOPE = "fspt-r";

type YahooTokenJson = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
  xoauth_yahoo_guid?: unknown;
};

type YahooErrorJson = {
  error?: unknown;
  error_description?: unknown;
};

export type YahooTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scope: string;
  tokenType: string | null;
  yahooGuid: string | null;
};

export type YahooAuthorizationTokenResponse = YahooTokenResponse & {
  refreshToken: string;
};

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function parseTokenError(response: Response): Promise<Error> {
  let parsed: YahooErrorJson = {};

  try {
    const json = (await response.json()) as unknown;

    if (json !== null && typeof json === "object") {
      parsed = json as YahooErrorJson;
    }
  } catch {
    parsed = {};
  }

  const error = stringField(parsed.error);
  const description = stringField(parsed.error_description);
  const detail = [error, description].filter(Boolean).join(": ");

  return new Error(
    `Yahoo OAuth token request failed with status ${response.status}${detail ? `: ${detail}` : ""}`,
  );
}

function parseTokenJson(json: unknown): YahooTokenResponse {
  if (json === null || typeof json !== "object") {
    throw new Error("Yahoo OAuth token response was not an object.");
  }

  const tokenJson = json as YahooTokenJson;
  const accessToken = stringField(tokenJson.access_token);

  if (accessToken === undefined) {
    throw new Error("Yahoo OAuth token response was missing access_token.");
  }

  if (typeof tokenJson.expires_in !== "number" || !Number.isFinite(tokenJson.expires_in)) {
    throw new Error("Yahoo OAuth token response was missing expires_in.");
  }

  return {
    accessToken,
    refreshToken: stringField(tokenJson.refresh_token),
    expiresAt: new Date(Date.now() + tokenJson.expires_in * 1000),
    scope: YAHOO_FANTASY_SCOPE,
    tokenType: stringField(tokenJson.token_type) ?? null,
    yahooGuid: stringField(tokenJson.xoauth_yahoo_guid) ?? null,
  };
}

async function requestTokens(body: URLSearchParams): Promise<YahooTokenResponse> {
  const { clientId, clientSecret } = getYahooConfig();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw await parseTokenError(response);
  }

  return parseTokenJson((await response.json()) as unknown);
}

export function buildAuthorizeUrl(state: string): URL {
  const { clientId, redirectUri } = getYahooConfig();
  const url = new URL(AUTHORIZE_URL);

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", YAHOO_FANTASY_SCOPE);
  url.searchParams.set("state", state);

  return url;
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<YahooAuthorizationTokenResponse> {
  const { redirectUri } = getYahooConfig();
  const tokens = await requestTokens(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  );

  if (tokens.refreshToken === undefined) {
    throw new Error("Yahoo OAuth token response was missing refresh_token.");
  }

  return { ...tokens, refreshToken: tokens.refreshToken };
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<YahooTokenResponse> {
  const { redirectUri } = getYahooConfig();

  return requestTokens(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      // Yahoo requires redirect_uri on refresh requests too.
      redirect_uri: redirectUri,
    }),
  );
}
