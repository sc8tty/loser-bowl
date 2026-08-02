import { readFile } from "node:fs/promises";

import { sql } from "drizzle-orm";

import * as schema from "../src/db/schema.ts";
import {
  createImportDb,
  fetchKnownTeamIds,
  loadLeagueSettings,
  logSyncRun,
  parseCliArgs,
  parseCsv,
  runImportScript,
} from "./lib/import-common.ts";
import { parseStatsRow, SUPPORT_STAT_SLUGS } from "./lib/stat-rows.ts";
import { LEAGUE_CONFIG } from "../src/config/league.ts";

const USAGE = "npm run import:stats -- [--dry-run] path/to/stats.csv";

async function main() {
  const { filePath, dryRun } = parseCliArgs(process.argv.slice(2), USAGE);
  const startedAt = new Date();
  const db = createImportDb();

  const csvText = await readFile(filePath, "utf8");
  const rows = parseCsv(csvText);

  const settings = await loadLeagueSettings(db);
  const knownTeamIds = await fetchKnownTeamIds(db);
  const maxWeek = LEAGUE_CONFIG.rounds[LEAGUE_CONFIG.rounds.length - 1].week;

  const ratioColumns = ["avg", "era", "whip"].filter((slug) =>
    Object.hasOwn(rows[0] ?? {}, slug),
  );

  if (ratioColumns.length > 0) {
    console.warn(
      `Ignoring provided ratio column(s) ${ratioColumns.join(", ")} — ratios are recomputed from support stats (${SUPPORT_STAT_SLUGS.join(", ")}).`,
    );
  }

  try {
    const parsed = rows.map((row, index) => {
      try {
        return parseStatsRow(row, settings.statCategories, {
          knownTeamIds,
          maxWeek,
        });
      } catch (error) {
        throw new Error(
          `Row ${index + 2}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });

    const seen = new Set<string>();
    for (const line of parsed) {
      const key = `${line.teamId}:${line.week}`;
      if (seen.has(key)) {
        throw new Error(`Duplicate team/week pair in CSV: ${key}`);
      }
      seen.add(key);
    }

    if (dryRun) {
      console.log(
        `[dry-run] ${parsed.length} stat line(s) validated (settings source: ${settings.source}). Nothing written.`,
      );
    } else {
      await db
        .insert(schema.statLines)
        .values(
          parsed.map((line) => ({
            teamId: line.teamId,
            week: line.week,
            stats: line.stats,
            source: "import" as const,
            syncRunId: null,
          })),
        )
        .onConflictDoUpdate({
          target: [schema.statLines.teamId, schema.statLines.week],
          set: {
            stats: sql`excluded.stats`,
            source: sql`excluded.source`,
            // Clear any stale Yahoo run pointer — this row's provenance is now
            // the import (cold-review P3-6).
            syncRunId: sql`excluded.sync_run_id`,
            syncedAt: sql`now()`,
          },
        });

      console.log(`Imported ${parsed.length} stat line(s).`);
    }

    await logSyncRun(db, {
      script: "import-stats",
      status: "success",
      startedAt,
      rowCount: parsed.length,
      dryRun,
    });
  } catch (error) {
    await logSyncRun(db, {
      script: "import-stats",
      status: "error",
      startedAt,
      rowCount: rows.length,
      dryRun,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

runImportScript(main);
