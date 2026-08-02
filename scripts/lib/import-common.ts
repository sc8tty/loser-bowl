import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import {
  SEEDED_LEAGUE_SETTINGS,
  type StatCategory,
} from "../../src/config/categories.seed.ts";
import * as schema from "../../src/db/schema.ts";

export type ImportDb = ReturnType<typeof createImportDb>;

export function createImportDb() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required. Run with DATABASE_URL=... npm run <script>",
    );
  }

  return drizzle(neon(databaseUrl), { schema });
}

export type CliArgs = {
  filePath: string;
  dryRun: boolean;
};

export function parseCliArgs(argv: readonly string[], usage: string): CliArgs {
  const args = argv.filter((arg) => arg !== "--");
  const dryRun = args.includes("--dry-run");
  const positional = args.filter((arg) => !arg.startsWith("--"));

  if (positional.length !== 1) {
    throw new Error(`Expected exactly one CSV file path.\nUsage: ${usage}`);
  }

  return { filePath: positional[0], dryRun };
}

/**
 * Minimal CSV parser: quoted fields, escaped quotes (""), commas inside
 * quotes, CRLF/LF line endings. Returns records keyed by the header row.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    throw new Error("Malformed CSV: unterminated quoted field.");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter(
    (cells) => !(cells.length === 1 && cells[0].trim() === ""),
  );

  if (nonEmpty.length < 2) {
    throw new Error("CSV must contain a header row and at least one data row.");
  }

  const [headerRow, ...dataRows] = nonEmpty;
  const headers = headerRow.map((header) => header.trim());

  // A trailing delimiter on the header row would otherwise become an empty
  // column name and surface as a confusing field-count error on every data
  // row (cold-review P3-8).
  if (headers.some((header) => header === "")) {
    throw new Error("CSV header row contains an empty column name (trailing comma?).");
  }

  return dataRows.map((cells, index) => {
    if (cells.length !== headers.length) {
      throw new Error(
        `CSV row ${index + 2} has ${cells.length} fields; expected ${headers.length}.`,
      );
    }

    return Object.fromEntries(
      headers.map((header, column) => [header, cells[column].trim()]),
    );
  });
}

export type LoadedSettings = {
  statCategories: readonly StatCategory[];
  minInningsPitched: number | null;
  season: number;
  source: "db" | "seed-fallback";
};

export async function loadLeagueSettings(db: ImportDb): Promise<LoadedSettings> {
  const rows = await db
    .select()
    .from(schema.leagueSettings)
    .where(sql`${schema.leagueSettings.season} = ${SEEDED_LEAGUE_SETTINGS.season}`);

  if (rows.length === 0) {
    console.warn(
      "league_settings table empty — falling back to seeded placeholder categories.",
    );

    return {
      statCategories: SEEDED_LEAGUE_SETTINGS.statCategories,
      minInningsPitched: SEEDED_LEAGUE_SETTINGS.minInningsPitched,
      season: SEEDED_LEAGUE_SETTINGS.season,
      source: "seed-fallback",
    };
  }

  const settings = rows[0];

  return {
    statCategories: settings.statCategories,
    minInningsPitched: settings.minInningsPitched,
    season: settings.season,
    source: "db",
  };
}

export async function fetchKnownTeamIds(db: ImportDb): Promise<Set<string>> {
  const rows = await db.select({ id: schema.teams.id }).from(schema.teams);

  return new Set(rows.map((row) => row.id));
}

export async function logSyncRun(
  db: ImportDb,
  options: {
    script: string;
    status: "success" | "error";
    startedAt: Date;
    rowCount: number;
    dryRun: boolean;
    error?: string;
  },
): Promise<void> {
  // --dry-run must not touch the database at all — a validation loop on a
  // broken CSV was writing an error row per attempt (cold-review P3-7, the
  // feeder for the backoff-poisoning P2-2).
  if (options.dryRun) {
    console.log(
      `[dry-run] not logged to sync_runs: ${options.script} ${options.status}${options.error ? ` (${options.error})` : ""}`,
    );
    return;
  }

  const finishedAt = new Date();

  await db.insert(schema.syncRuns).values({
    trigger: "backfill",
    status: options.status,
    startedAt: options.startedAt,
    finishedAt,
    durationMs: finishedAt.getTime() - options.startedAt.getTime(),
    error: options.error ?? null,
    detail: {
      script: options.script,
      rowCount: options.rowCount,
      dryRun: options.dryRun,
    },
  });
}

export type MatchupWinner = "a" | "b" | "tie";

export type NormalizedMatchupPair = {
  teamAId: string;
  teamBId: string;
  winner: MatchupWinner;
};

/**
 * Canonicalizes an unordered pair so team_a_id < team_b_id (the schema CHECK
 * requires it), flipping the winner designation when the teams swap.
 */
export function normalizeMatchupPair(
  teamAId: string,
  teamBId: string,
  winner: MatchupWinner,
): NormalizedMatchupPair {
  if (teamAId === teamBId) {
    throw new Error(`A matchup needs two distinct teams (got "${teamAId}" twice).`);
  }

  if (teamAId < teamBId) {
    return { teamAId, teamBId, winner };
  }

  const flipped: MatchupWinner =
    winner === "a" ? "b" : winner === "b" ? "a" : "tie";

  return { teamAId: teamBId, teamBId: teamAId, winner: flipped };
}

export function assertCompleteRanks(
  entries: readonly { teamId: string; rank: number }[],
): void {
  if (entries.length !== 16) {
    throw new Error(`Expected 16 teams, received ${entries.length}.`);
  }

  // Duplicate team ids with complete ranks would double-update one team and
  // leave another's stale rank colliding downstream (cold-review P2-3).
  const teamIds = new Set(entries.map((entry) => entry.teamId));
  if (teamIds.size !== 16) {
    throw new Error("Standings must contain 16 UNIQUE team ids (duplicate found).");
  }

  const ranks = new Set(entries.map((entry) => entry.rank));
  const complete = Array.from({ length: 16 }, (_, index) =>
    ranks.has(index + 1),
  ).every(Boolean);

  if (!complete) {
    throw new Error("Standings must contain every rank from 1 through 16 exactly once.");
  }
}

export function runImportScript(main: () => Promise<void>): void {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
