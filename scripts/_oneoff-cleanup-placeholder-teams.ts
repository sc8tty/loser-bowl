import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { inArray, eq } from "drizzle-orm";

import * as schema from "../src/db/schema.ts";

const PLACEHOLDER_IDS = [
  "moonshot-accountants",
  "walkoff-book-club",
  "warning-track-heroes",
  "dugout-philosophers",
  "bat-flip-bureau",
  "high-socks-union",
  "popup-practitioners",
  "box-score-poets",
  "cellar-strategists",
  "late-inning-laundry",
  "foul-line-analysts",
  "rain-delay-regulars",
  "bullpen-committee",
  "waiver-wire-interns",
  "bench-depth-department",
  "last-pick-legends",
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");

  const db = drizzle(neon(databaseUrl), { schema });

  const deletedMatchups = await db
    .delete(schema.matchups)
    .returning({ id: schema.matchups.id });
  console.log(`Deleted ${deletedMatchups.length} matchup row(s).`);

  await db
    .update(schema.syncState)
    .set({
      seedLockStatus: "none",
      seedsLockedAt: null,
      seedsSettledAt: null,
      seedsSnapshot: null,
      seedsCorrectedSnapshot: null,
    })
    .where(eq(schema.syncState.id, 1));
  console.log("Reset sync_state seed-lock fields.");

  await db.update(schema.teams).set({ finalSeed: null });
  console.log("Cleared finalSeed on all teams.");

  const deletedTeams = await db
    .delete(schema.teams)
    .where(inArray(schema.teams.id, PLACEHOLDER_IDS))
    .returning({ id: schema.teams.id });
  console.log(
    `Deleted ${deletedTeams.length} placeholder team(s):`,
    deletedTeams.map((t) => t.id),
  );

  const remaining = await db
    .select({
      id: schema.teams.id,
      name: schema.teams.name,
      rank: schema.teams.currentRank,
    })
    .from(schema.teams);
  console.log(`Remaining teams: ${remaining.length}`);
  console.table(remaining.sort((a, b) => a.rank - b.rank));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
