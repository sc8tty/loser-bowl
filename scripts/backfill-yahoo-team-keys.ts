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

// Match is by EXACT team name, so a collision on either side must abort before
// any write: two Yahoo teams sharing a name would silently pick the last one,
// two DB teams sharing a name would both take the same key, and a team renamed
// on Yahoo since the DB row was created could steal another team's key. Every
// check runs against the full plan before a single row is touched.
const problems: string[] = [];
const byName = new Map<string, string>();
for (let i = 0; i < count; i += 1) {
  const meta = collection[String(i)].team[0];
  const name = meta.find((m) => "name" in m)?.name as string;
  const key = meta.find((m) => "team_key" in m)?.team_key as string;

  if (byName.has(name)) {
    problems.push(`Yahoo lists "${name}" twice (${byName.get(name)} and ${key})`);
  }

  byName.set(name, key);
}

const db = createImportDb();
const rows = await db.select({ id: teams.id, name: teams.name, key: teams.yahooTeamKey }).from(teams);

const seenDbNames = new Set<string>();
for (const row of rows) {
  if (seenDbNames.has(row.name)) {
    problems.push(`DB has two teams named "${row.name}"`);
  }

  seenDbNames.add(row.name);
}

type Change = { id: string; name: string; from: string | null; to: string };
const plan: Change[] = [];
const unmatched: string[] = [];
const currentKeyOwner = new Map<string, string>(
  rows.flatMap((r) => (r.key === null ? [] : [[r.key, r.name] as const])),
);

for (const row of rows) {
  const key = byName.get(row.name);

  if (key === undefined) {
    unmatched.push(row.name);
    continue;
  }

  if (row.key === key) {
    continue;
  }

  const owner = currentKeyOwner.get(key);
  if (owner !== undefined && owner !== row.name) {
    problems.push(
      `"${row.name}" would take ${key}, which "${owner}" already holds — a rename on Yahoo? Fix the DB name first.`,
    );
  }

  plan.push({ id: row.id, name: row.name, from: row.key, to: key });
}

const targets = new Map<string, string[]>();
for (const change of plan) {
  targets.set(change.to, [...(targets.get(change.to) ?? []), change.name]);
}
for (const [key, names] of targets) {
  if (names.length > 1) {
    problems.push(`${key} would be assigned to ${names.length} teams: ${names.join(", ")}`);
  }
}

if (unmatched.length > 0) {
  problems.push(`NO Yahoo match by exact name for: ${unmatched.join(", ")}`);
}

if (problems.length > 0) {
  console.error("Refusing to write; fix these first:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

for (const change of plan) {
  console.log(`${dryRun ? "[dry-run] " : ""}${change.id.padEnd(26)} -> ${change.to}${change.from ? `  (was ${change.from})` : ""}`);

  if (!dryRun) {
    await db.update(teams).set({ yahooTeamKey: change.to }).where(eq(teams.id, change.id));
  }
}

console.log(`${dryRun ? "[dry-run] would update" : "Updated"} ${plan.length} of ${rows.length} teams.`);

process.exit(0);
