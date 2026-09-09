import { eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { oauthTokens } from "@/db/schema";
import { refreshAccessToken } from "./oauth";

const REFRESH_SKEW_MS = 60 * 1000;

export type StoreTokensInput = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string | null;
};

export async function storeTokens(tokens: StoreTokensInput): Promise<void> {
  const db = getDb();
  const updatedAt = new Date();

  await db
    .insert(oauthTokens)
    .values({
      id: 1,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: oauthTokens.id,
      set: {
        accessToken: sql`excluded.access_token`,
        refreshToken: sql`excluded.refresh_token`,
        expiresAt: sql`excluded.expires_at`,
        scope: sql`excluded.scope`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

export type YahooConnectionStatus =
  | { connected: false }
  | { connected: true; expiresAt: Date; updatedAt: Date };

/**
 * Selects only the timestamp columns — never the token columns — so that
 * rendering connection status in a server component cannot leak an access or
 * refresh token into the page payload.
 */
export async function getYahooConnectionStatus(): Promise<YahooConnectionStatus> {
  const db = getDb();
  const rows = await db
    .select({
      expiresAt: oauthTokens.expiresAt,
      updatedAt: oauthTokens.updatedAt,
    })
    .from(oauthTokens)
    .where(eq(oauthTokens.id, 1))
    .limit(1);
  const row = rows[0];

  return row === undefined
    ? { connected: false }
    : { connected: true, expiresAt: row.expiresAt, updatedAt: row.updatedAt };
}

export async function getValidAccessToken(): Promise<string> {
  const db = getDb();
  const rows = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.id, 1))
    .limit(1);
  const tokens = rows[0];

  if (tokens === undefined) {
    throw new Error("Yahoo not connected. Connect Yahoo OAuth before syncing.");
  }

  if (tokens.expiresAt.getTime() > Date.now() + REFRESH_SKEW_MS) {
    return tokens.accessToken;
  }

  const refreshed = await refreshAccessToken(tokens.refreshToken);
  const refreshToken = refreshed.refreshToken ?? tokens.refreshToken;

  await storeTokens({
    accessToken: refreshed.accessToken,
    refreshToken,
    expiresAt: refreshed.expiresAt,
    scope: refreshed.scope,
  });

  return refreshed.accessToken;
}
