import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

export class MissingDatabaseUrlError extends Error {
  readonly code = "MISSING_DATABASE_URL";

  constructor() {
    super("DATABASE_URL is required before accessing the league database.");
    this.name = "MissingDatabaseUrlError";
  }
}

function createDb(databaseUrl: string) {
  const client = neon(databaseUrl);

  return drizzle(client, { schema });
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
