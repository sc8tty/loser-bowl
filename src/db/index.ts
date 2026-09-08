import "server-only";

import ws from "ws";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "./schema";

export class MissingDatabaseUrlError extends Error {
  readonly code = "MISSING_DATABASE_URL";

  constructor() {
    super("DATABASE_URL is required before accessing the league database.");
    this.name = "MissingDatabaseUrlError";
  }
}

// neon-http (the HTTP/fetch driver) never supports db.transaction() — it's
// stateless per request. seedLock.ts and matchupCompute.ts both need real
// transactions for their atomic multi-row writes, so this uses the
// WebSocket-based Pool driver instead (confirmed working in Vercel's Node.js
// runtime, not just Edge — `ws` supplies the WebSocket implementation Node
// itself lacks).
function createDb(databaseUrl: string) {
  return drizzle({
    connection: databaseUrl,
    schema,
    ws,
  });
}

export type Db = ReturnType<typeof createDb>;

let db: Db | null = null;

export function getDb(): Db {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new MissingDatabaseUrlError();
  }

  db ??= createDb(databaseUrl);

  return db;
}
