import { readFile } from "node:fs/promises";

import { sql } from "drizzle-orm";
import { z } from "zod";

import * as schema from "../src/db/schema.ts";
import {
  createImportDb,
  fetchKnownTeamIds,
  logSyncRun,
  normalizeMatchupPair,
  parseCliArgs,
  parseCsv,
  runImportScript,
} from "./lib/import-common.ts";

const USAGE =
  "npm run import:matchups -- [--dry-run] path/to/regular-season-matchups.csv";

const matchupRowSchema = z.object({
  week: z.coerce.number().int().min(1).max(22),
  team_a_id: z.string().min(1),
  team_b_id: z.string().min(1),
  winner: z.enum(["a", "b", "tie"]),
});

async function main() {
  const { filePath, dryRun } = parseCliArgs(process.argv.slice(2), USAGE);
  const startedAt = new Date();
  const db = createImportDb();

  const csvText = await readFile(filePath, "utf8");
  const rows = parseCsv(csvText);

  try {
    const knownTeamIds = await fetchKnownTeamIds(db);

    const parsed = rows.map((row, index) => {
      const result = matchupRowSchema.safeParse(row);

      if (!result.success) {
        throw new Error(`Row ${index + 2}: ${result.error.issues[0]?.message}`);
      }

      const data = result.data;

      for (const teamId of [data.team_a_id, data.team_b_id]) {
        if (!knownTeamIds.has(teamId)) {
          throw new Error(`Row ${index + 2}: unknown team_id "${teamId}".`);
        }
      }

      const normalized = normalizeMatchupPair(
        data.team_a_id,
        data.team_b_id,
        data.winner,
      );

      return {
        week: data.week,
        teamAId: normalized.teamAId,
        teamBId: normalized.teamBId,
        winnerTeamId:
          normalized.winner === "tie"
            ? null
            : normalized.winner === "a"
              ? normalized.teamAId
              : normalized.teamBId,
        raw: { source: "import", original: row },
      };
    });

    const seen = new Set<string>();
    for (const matchup of parsed) {
      const key = `${matchup.week}:${matchup.teamAId}:${matchup.teamBId}`;
      if (seen.has(key)) {
        throw new Error(`Duplicate matchup in CSV: ${key}`);
      }
      seen.add(key);
    }

    if (dryRun) {
      console.log(
        `[dry-run] ${parsed.length} matchup(s) validated (pairs normalized). Nothing written.`,
      );
    } else {
      await db
        .insert(schema.regularSeasonMatchups)
        .values(
          parsed.map((matchup) => ({
            week: matchup.week,
            teamAId: matchup.teamAId,
            teamBId: matchup.teamBId,
            winnerTeamId: matchup.winnerTeamId,
            teamACategoryWins: null,
            teamBCategoryWins: null,
            tiedCategories: null,
            source: "import" as const,
            raw: matchup.raw,
          })),
        )
        .onConflictDoUpdate({
          target: [
            schema.regularSeasonMatchups.week,
            schema.regularSeasonMatchups.teamAId,
            schema.regularSeasonMatchups.teamBId,
          ],
          set: {
            winnerTeamId: sql`excluded.winner_team_id`,
            source: sql`excluded.source`,
            raw: sql`excluded.raw`,
          },
        });

      console.log(`Imported ${parsed.length} regular-season matchup(s).`);
    }

    await logSyncRun(db, {
      script: "import-regular-season-matchups",
      status: "success",
      startedAt,
      rowCount: parsed.length,
      dryRun,
    });
  } catch (error) {
    await logSyncRun(db, {
      script: "import-regular-season-matchups",
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
