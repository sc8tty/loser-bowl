import { readFile } from "node:fs/promises";

import { sql } from "drizzle-orm";
import { z } from "zod";

import * as schema from "../src/db/schema.ts";
import {
  assertCompleteRanks,
  createImportDb,
  fetchKnownTeamIds,
  logSyncRun,
  parseCliArgs,
  parseCsv,
  runImportScript,
} from "./lib/import-common.ts";

const USAGE = "npm run import:standings -- [--dry-run] path/to/standings.csv";

const standingsRowSchema = z.object({
  team_id: z.string().min(1),
  current_rank: z.coerce.number().int().min(1).max(16),
  category_wins: z.coerce.number().int().min(0),
  category_losses: z.coerce.number().int().min(0),
  category_ties: z.coerce.number().int().min(0),
});

async function main() {
  const { filePath, dryRun } = parseCliArgs(process.argv.slice(2), USAGE);
  const startedAt = new Date();
  const db = createImportDb();

  const csvText = await readFile(filePath, "utf8");
  const rows = parseCsv(csvText);

  try {
    const parsed = rows.map((row, index) => {
      const result = standingsRowSchema.safeParse(row);

      if (!result.success) {
        throw new Error(`Row ${index + 2}: ${result.error.issues[0]?.message}`);
      }

      return result.data;
    });

    assertCompleteRanks(
      parsed.map((row) => ({ teamId: row.team_id, rank: row.current_rank })),
    );

    const knownTeamIds = await fetchKnownTeamIds(db);
    for (const row of parsed) {
      if (!knownTeamIds.has(row.team_id)) {
        throw new Error(`Unknown team_id "${row.team_id}".`);
      }
    }

    if (dryRun) {
      console.log(
        `[dry-run] ${parsed.length} standings row(s) validated. Nothing written.`,
      );
    } else {
      for (const row of parsed) {
        await db
          .update(schema.teams)
          .set({
            currentRank: row.current_rank,
            regularSeasonOutcomeTotals: {
              source: "import",
              category_wins: row.category_wins,
              category_losses: row.category_losses,
              category_ties: row.category_ties,
            },
          })
          .where(sql`${schema.teams.id} = ${row.team_id}`);
      }

      console.log(`Updated standings for ${parsed.length} team(s).`);
    }

    await logSyncRun(db, {
      script: "import-standings",
      status: "success",
      startedAt,
      rowCount: parsed.length,
      dryRun,
    });
  } catch (error) {
    await logSyncRun(db, {
      script: "import-standings",
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
