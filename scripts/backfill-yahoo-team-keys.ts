import { readFile } from "node:fs/promises";

import { eq } from "drizzle-orm";

import { teams } from "../src/db/schema.ts";
import { createImportDb } from "./lib/import-common.ts";

const USAGE =
  "node --env-file=.env.local --experimental-strip-types scripts/backfill-yahoo-team-keys.ts [--dry-run] <league-teams-stats fixture.json>";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const fixturePath = args.find((a) => !a.startsWith("--"));

if (!fixturePath) {
  console.error(USAGE);
  process.exit(1);
}

type YahooTeamsResponse = {
  fantasy_content: {
    league: [unknown, { teams: Record<string, { team: [Array<Record<string, unknown>>, unknown] }> & { count: string } }];
  };
};

const json = JSON.parse(await readFile(fixturePath, "utf8")) as YahooTeamsResponse;
const collection = json.fantasy_content.league[1].teams;
const count = Number(collection.count);

const byName = new Map<string, string>();
for (let i = 0; i < count; i += 1) {
  const meta = collection[String(i)].team[0];
  const name = meta.find((m) => "name" in m)?.name as string;
  const key = meta.find((m) => "team_key" in m)?.team_key as string;
  byName.set(name, key);
}

const db = createImportDb();
const rows = await db.select({ id: teams.id, name: teams.name, key: teams.yahooTeamKey }).from(teams);

let updated = 0;
const unmatched: string[] = [];

for (const row of rows) {
  const key = byName.get(row.name);

  if (key === undefined) {
    unmatched.push(row.name);
    continue;
  }

  if (row.key === key) {
    continue;
  }

  console.log(`${dryRun ? "[dry-run] " : ""}${row.id.padEnd(26)} -> ${key}${row.key ? `  (was ${row.key})` : ""}`);

  if (!dryRun) {
    await db.update(teams).set({ yahooTeamKey: key }).where(eq(teams.id, row.id));
  }

  updated += 1;
}

console.log(`${dryRun ? "[dry-run] would update" : "Updated"} ${updated} of ${rows.length} teams.`);

if (unmatched.length > 0) {
  console.error(`NO Yahoo match by exact name for: ${unmatched.join(", ")}`);
  process.exit(1);
}

process.exit(0);
