import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TokenRow = {
  id: number;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string | null;
  updatedAt: Date;
};

type StoredToken = {
  id: number;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string | null;
  updatedAt: Date;
};

const dbState = vi.hoisted(() => ({
  rows: [] as TokenRow[],
  writes: [] as StoredToken[],
  writeError: null as Error | null,
  getDb: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: dbState.getDb,
}));

import { DrizzleQueryError } from "drizzle-orm/errors";

import { getValidAccessToken, storeTokens } from "./tokens";

const NOW = new Date("2026-09-10T12:00:00.000Z");
const ORIGINAL_ENV = {
  YAHOO_CLIENT_ID: process.env.YAHOO_CLIENT_ID,
  YAHOO_CLIENT_SECRET: process.env.YAHOO_CLIENT_SECRET,
  YAHOO_REDIRECT_URI: process.env.YAHOO_REDIRECT_URI,
};

function fakeDb() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => dbState.rows,
        }),
      }),
    }),
    insert: () => ({
      values: (value: StoredToken) => ({
        onConflictDoUpdate: async () => {
          if (dbState.writeError !== null) {
            throw dbState.writeError;
          }

          dbState.writes.push(value);
          dbState.rows = [
            {
              id: value.id,
              accessToken: value.accessToken,
              refreshToken: value.refreshToken,
              expiresAt: value.expiresAt,
              scope: value.scope,
              updatedAt: value.updatedAt,
            },
          ];
        },
      }),
    }),
  };
}

function row(expiresAt: Date): TokenRow {
  return {
    id: 1,
    accessToken: "stored-access",
    refreshToken: "old-refresh",
    expiresAt,
    scope: "fspt-r",
    updatedAt: new Date("2026-09-09T12:00:00.000Z"),
  };
}

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

function stubRefreshResponse(refreshToken?: string) {
  const fetchMock = vi.fn<typeof fetch>(async () =>
    new Response(
      JSON.stringify({
        access_token: "fresh-access",
        ...(refreshToken === undefined ? {} : { refresh_token: refreshToken }),
        expires_in: 3600,
        token_type: "bearer",
        xoauth_yahoo_guid: "guid",
      }),
      { status: 200 },
    ),
  );

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  setYahooEnv();
  dbState.rows = [];
  dbState.writes = [];
  dbState.writeError = null;
  dbState.getDb.mockReset();
  dbState.getDb.mockReturnValue(fakeDb());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  restoreEnv("YAHOO_CLIENT_ID");
  restoreEnv("YAHOO_CLIENT_SECRET");
  restoreEnv("YAHOO_REDIRECT_URI");
});

/**
 * The real Drizzle error class, so the test pins the actual message shape
 * (`Failed query: <sql>\nparams: <bound values>`) rather than a guess at it.
 */
function driverFailure(...params: string[]): DrizzleQueryError {
  return new DrizzleQueryError(
    "insert into oauth_tokens (...) values ($1, $2, ...)",
    params,
    new Error("connection reset"),
  );
}

describe("Yahoo token storage", () => {
  it("never puts the tokens in the error when the upsert fails", async () => {
    const driverError = driverFailure("secret-access", "secret-refresh");
    dbState.writeError = driverError;

    // Sanity check the premise: the raw driver error really does carry them.
    expect(driverError.message).toContain("secret-access");
    expect(driverError.message).toContain("secret-refresh");

    const thrown = await storeTokens({
      accessToken: "secret-access",
      refreshToken: "secret-refresh",
      expiresAt: new Date(NOW.getTime() + 3_600_000),
      scope: "fspt-r",
    }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(thrown).toBeInstanceOf(Error);
    const error = thrown as Error;
    expect(error.message).toBe("Failed to store Yahoo tokens");
    expect(error.message).not.toContain("secret-access");
    expect(error.message).not.toContain("secret-refresh");
    expect(String(error)).not.toContain("secret-");
    expect(error.cause).toBe(driverError);
  });

  it("never puts the tokens in the error when the refresh path's write fails", async () => {
    dbState.rows = [row(new Date(NOW.getTime() - 1_000))];
    stubRefreshResponse("new-refresh");
    dbState.writeError = driverFailure("fresh-access", "new-refresh");

    const thrown = await getValidAccessToken().then(
      () => null,
      (error: unknown) => error,
    );

    expect(thrown).toBeInstanceOf(Error);
    const error = thrown as Error;
    expect(error.message).toBe("Failed to store Yahoo tokens");
    expect(error.message).not.toContain("fresh-access");
    expect(error.message).not.toContain("new-refresh");
    expect(dbState.writes).toHaveLength(0);
  });

  it("keeps the old refresh token when Yahoo omits refresh_token", async () => {
    dbState.rows = [row(new Date(NOW.getTime() - 1_000))];
    const fetchMock = stubRefreshResponse();

    await expect(getValidAccessToken()).resolves.toBe("fresh-access");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(dbState.writes).toHaveLength(1);
    expect(dbState.writes[0].refreshToken).toBe("old-refresh");
  });

  it("replaces the refresh token when Yahoo returns one", async () => {
    dbState.rows = [row(new Date(NOW.getTime() - 1_000))];
    const fetchMock = stubRefreshResponse("new-refresh");

    await expect(getValidAccessToken()).resolves.toBe("fresh-access");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(dbState.writes).toHaveLength(1);
    expect(dbState.writes[0].refreshToken).toBe("new-refresh");
  });

  it("refreshes a token that is inside the 60-second skew", async () => {
    dbState.rows = [row(new Date(NOW.getTime() + 30_000))];
    const fetchMock = stubRefreshResponse();

    await expect(getValidAccessToken()).resolves.toBe("fresh-access");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(dbState.writes[0]).toMatchObject({
      accessToken: "fresh-access",
      refreshToken: "old-refresh",
      scope: "fspt-r",
    });
    expect(dbState.writes[0].expiresAt).toEqual(
      new Date(NOW.getTime() + 3_600_000),
    );
  });

  it("does not refresh a token that is still valid beyond the skew", async () => {
    dbState.rows = [row(new Date(NOW.getTime() + 300_000))];
    const fetchMock = stubRefreshResponse();

    await expect(getValidAccessToken()).resolves.toBe("stored-access");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(dbState.writes).toHaveLength(0);
  });
});
