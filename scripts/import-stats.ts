import { readFile } from "node:fs/promises";

import { inArray, sql } from "drizzle-orm";

import * as schema from "../src/db/schema.ts";
import {
  createImportDb,
  fetchKnownTeamIds,
  type ImportDb,
  loadLeagueSettings,
  logSyncRun,
  parseCliArgs,
  parseCsv,
  runImportScript,
} from "./lib/import-common.ts";
import { parseStatsRow, SUPPORT_STAT_SLUGS } from "./lib/stat-rows.ts";
import { LEAGUE_CONFIG } from "../src/config/league.ts";
import { computeLiveTally } from "../src/lib/bracket/liveTally.ts";
import type { StatCategory } from "../src/config/categories.seed.ts";

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

  const ratioColumns = ["avg"].filter((slug) =>
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

    if (!dryRun) {
      // After the success log on purpose: the stats are committed by now, so
      // a report-side failure must not record the import as an error (Codex
      // review 2026-09-07, P2).
      try {
        await printLiveTallies(
          db,
          [...new Set(parsed.map((line) => line.week))],
          settings.statCategories,
        );
      } catch (error) {
        console.warn(
          `Import succeeded, but the live-tally report failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
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

/**
 * What the public site shows right after this import: the same read-time
 * live comparison src/lib/sync/trigger.ts renders, so a transcription slip
 * (a swapped column, a wrong team) is visible here before anyone else sees it.
 */
async function printLiveTallies(
  db: ImportDb,
  weeks: number[],
  statCategories: readonly StatCategory[],
): Promise<void> {
  const [matchupRows, teamRows, lineRows] = await Promise.all([
    db.select().from(schema.matchups),
    db.select({ id: schema.teams.id, name: schema.teams.name }).from(schema.teams),
    db.select().from(schema.statLines).where(inArray(schema.statLines.week, weeks)),
  ]);
  const names = new Map(teamRows.map((team) => [team.id, team.name]));
  const name = (id: string) => names.get(id) ?? id;
  const now = new Date();
  const report = matchupRows
    .filter((matchup) => weeks.includes(matchup.week))
    .sort((a, b) => a.round - b.round || a.id.localeCompare(b.id))
    .map((matchup) => {
      if (matchup.round !== 1 && matchup.round !== 2 && matchup.round !== 3) {
        return `${matchup.id}: unsupported round ${matchup.round}`;
      }

      const tally = computeLiveTally({
        matchup: {
          round: matchup.round,
          week: matchup.week,
          status: matchup.status,
          highTeamId: matchup.highTeamId,
          lowTeamId: matchup.lowTeamId,
        },
        statLines: lineRows,
        leagueSettings: { statCategories },
        now,
      });

      if (tally === null) {
        const why =
          matchup.highTeamId === null || matchup.lowTeamId === null
            ? "teams TBD"
            : matchup.status !== "pending" && matchup.status !== "live"
              ? `engine owns it (${matchup.status})`
              : "missing a stat line for this week";

        return `${matchup.id} (week ${matchup.week}): no live tally — ${why}`;
      }

      const lead =
        tally.leaderTeamId === null ? "tied" : `${name(tally.leaderTeamId)} leads`;

      return `${matchup.id} (week ${matchup.week}): ${name(tally.teamAId)} ${tally.teamAWins}-${tally.teamBWins}-${tally.tiedCategories} ${name(tally.teamBId)} — ${lead}`;
    });

  if (report.length === 0) {
    console.log("No bowl matchups use the imported week(s) yet.");
    return;
  }

  console.log("Live tallies now showing on the site:");
  for (const line of report) {
    console.log(`  ${line}`);
  }
}

runImportScript(main);
