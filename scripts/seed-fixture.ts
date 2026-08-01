import { readFile } from "node:fs/promises";

import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import { SEEDED_LEAGUE_SETTINGS } from "../src/config/categories.seed.ts";
import { LEAGUE_CONFIG } from "../src/config/league.ts";
import * as schema from "../src/db/schema.ts";

type FixtureTeam = {
  id: string;
  name: string;
  current_rank: number;
  wins: number;
  losses: number;
  ties: number;
};

type StandingsFixture = {
  _fixture: string;
  season: number;
  teams: FixtureTeam[];
};

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required to seed fixture data. Run with DATABASE_URL=... npm run seed:fixture",
    );
  }

  return databaseUrl;
}

function assertFixture(fixture: StandingsFixture) {
  if (fixture.season !== LEAGUE_CONFIG.season) {
    throw new Error(
      `Fixture season ${fixture.season} does not match league season ${LEAGUE_CONFIG.season}.`,
    );
  }

  if (fixture.teams.length !== 16) {
    throw new Error(`Expected 16 fixture teams, received ${fixture.teams.length}.`);
  }

  const ranks = new Set(fixture.teams.map((team) => team.current_rank));
  const hasRanksOneThroughSixteen = Array.from({ length: 16 }, (_, index) =>
    ranks.has(index + 1),
  ).every(Boolean);

  if (!hasRanksOneThroughSixteen) {
    throw new Error("Fixture teams must contain every rank from 1 through 16.");
  }
}

async function readStandingsFixture(): Promise<StandingsFixture> {
  const fixtureUrl = new URL("../fixtures/standings.fixture.json", import.meta.url);
  const fixtureJson = await readFile(fixtureUrl, "utf8");

  return JSON.parse(fixtureJson) as StandingsFixture;
}

async function main() {
  const fixture = await readStandingsFixture();
  assertFixture(fixture);

  const db = drizzle(neon(requireDatabaseUrl()), { schema });

  await db
    .insert(schema.leagueSettings)
    .values({
      season: SEEDED_LEAGUE_SETTINGS.season,
      statCategories: SEEDED_LEAGUE_SETTINGS.statCategories,
      minInningsPitched: SEEDED_LEAGUE_SETTINGS.minInningsPitched,
      playoffStartWeek: SEEDED_LEAGUE_SETTINGS.playoffStartWeek,
      source: SEEDED_LEAGUE_SETTINGS.source,
      version: SEEDED_LEAGUE_SETTINGS.version,
    })
    .onConflictDoUpdate({
      target: schema.leagueSettings.season,
      set: {
        statCategories: sql`excluded.stat_categories`,
        minInningsPitched: sql`excluded.min_innings_pitched`,
        playoffStartWeek: sql`excluded.playoff_start_week`,
        source: sql`excluded.source`,
        version: sql`excluded.version`,
      },
    });

  await db
    .insert(schema.teams)
    .values(
      fixture.teams.map((team) => ({
        id: team.id,
        yahooTeamKey: null,
        name: team.name,
        currentRank: team.current_rank,
        finalSeed: null,
        regularSeasonOutcomeTotals: {
          source: "fixture",
          category_wins: team.wins,
          category_losses: team.losses,
          category_ties: team.ties,
        },
      })),
    )
    .onConflictDoUpdate({
      target: schema.teams.id,
      set: {
        name: sql`excluded.name`,
        currentRank: sql`excluded.current_rank`,
        regularSeasonOutcomeTotals: sql`excluded.regular_season_outcome_totals`,
      },
    });

  // Singleton row Issue 4A's atomic lock claim (UPDATE ... WHERE id = 1) depends on —
  // without it the claim silently no-ops on an empty table.
  await db.insert(schema.syncState).values({ id: 1 }).onConflictDoNothing();

  console.log(
    `Seeded ${fixture.teams.length} fixture teams and placeholder ${LEAGUE_CONFIG.season} league settings.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
