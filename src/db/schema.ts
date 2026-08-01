import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { StatCategory } from "@/config/categories.seed";

const timestamps = {
  withTimezone: true,
  mode: "date",
} as const;

type JsonRecord = Record<string, unknown>;

export type OutcomeTotals = {
  source?: string;
  category_wins?: number;
  category_losses?: number;
  category_ties?: number;
};

export const leagueSettingsSourceEnum = pgEnum("league_settings_source", [
  "yahoo",
  "seed",
]);

export const statLineSourceEnum = pgEnum("stat_line_source", [
  "yahoo",
  "manual",
  "import",
]);

export const matchupStatusEnum = pgEnum("matchup_status", [
  "pending",
  "live",
  "provisional",
  "under_review",
  "final",
]);

export const regularSeasonMatchupSourceEnum = pgEnum(
  "regular_season_matchup_source",
  ["yahoo", "import"],
);

export const seedLockStatusEnum = pgEnum("seed_lock_status", [
  "none",
  "provisional",
  "under_review",
  "settled",
]);

export const syncRunTriggerEnum = pgEnum("sync_run_trigger", [
  "visit",
  "cron",
  "admin",
  "backfill",
]);

export const syncRunStatusEnum = pgEnum("sync_run_status", [
  "running",
  "success",
  "error",
]);

export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    id: integer("id").default(1).primaryKey(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    expiresAt: timestamp("expires_at", timestamps).notNull(),
    scope: text("scope"),
    updatedAt: timestamp("updated_at", timestamps).defaultNow().notNull(),
  },
  (table) => [
    check("oauth_tokens_single_row", sql`${table.id} = 1`),
  ],
);

export const leagueSettings = pgTable("league_settings", {
  season: integer("season").primaryKey(),
  statCategories: jsonb("stat_categories")
    .$type<readonly StatCategory[]>()
    .notNull(),
  minInningsPitched: numeric("min_innings_pitched", {
    precision: 5,
    scale: 2,
    mode: "number",
  }),
  playoffStartWeek: integer("playoff_start_week").notNull(),
  source: leagueSettingsSourceEnum("source").notNull(),
  version: integer("version").default(1).notNull(),
});

export const teams = pgTable(
  "teams",
  {
    id: text("id").primaryKey(),
    yahooTeamKey: text("yahoo_team_key"),
    name: text("name").notNull(),
    currentRank: integer("current_rank").notNull(),
    finalSeed: integer("final_seed"),
    // Single source of truth for the season record (tiebreaker #2 canonical) —
    // no separate W/L/T columns, so nothing can drift from it.
    regularSeasonOutcomeTotals: jsonb("regular_season_outcome_totals")
      .$type<OutcomeTotals>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("teams_yahoo_team_key_unique").on(table.yahooTeamKey),
  ],
);

export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  trigger: syncRunTriggerEnum("trigger").notNull(),
  status: syncRunStatusEnum("status").notNull(),
  startedAt: timestamp("started_at", timestamps).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", timestamps),
  durationMs: integer("duration_ms"),
  error: text("error"),
  detail: jsonb("detail").$type<JsonRecord>().default(sql`'{}'::jsonb`).notNull(),
});

export const statLines = pgTable(
  "stat_lines",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    week: integer("week").notNull(),
    stats: jsonb("stats").$type<JsonRecord>().notNull(),
    source: statLineSourceEnum("source").notNull(),
    syncRunId: integer("sync_run_id").references(() => syncRuns.id, {
      onDelete: "set null",
    }),
    syncedAt: timestamp("synced_at", timestamps).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: "stat_lines_team_week_pk",
      columns: [table.teamId, table.week],
    }),
  ],
);

export const matchups = pgTable("matchups", {
  id: text("id").primaryKey(),
  round: integer("round").notNull(),
  week: integer("week").notNull(),
  highTeamId: text("high_team_id").references(() => teams.id, {
    onDelete: "set null",
  }),
  lowTeamId: text("low_team_id").references(() => teams.id, {
    onDelete: "set null",
  }),
  status: matchupStatusEnum("status").default("pending").notNull(),
  computedTally: jsonb("computed_tally").$type<JsonRecord>(),
  computedWinnerTeamId: text("computed_winner_team_id").references(
    () => teams.id,
    { onDelete: "set null" },
  ),
  decidedBy: text("decided_by"),
  lockedAt: timestamp("locked_at", timestamps),
  settledAt: timestamp("settled_at", timestamps),
  overrideWinnerTeamId: text("override_winner_team_id").references(
    () => teams.id,
    { onDelete: "set null" },
  ),
  overrideNote: text("override_note"),
  overriddenAt: timestamp("overridden_at", timestamps),
});

export const regularSeasonMatchups = pgTable(
  "regular_season_matchups",
  {
    week: integer("week").notNull(),
    teamAId: text("team_a_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    teamBId: text("team_b_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    winnerTeamId: text("winner_team_id").references(() => teams.id, {
      onDelete: "set null",
    }),
    teamACategoryWins: integer("team_a_category_wins"),
    teamBCategoryWins: integer("team_b_category_wins"),
    tiedCategories: integer("tied_categories"),
    source: regularSeasonMatchupSourceEnum("source").notNull(),
    raw: jsonb("raw").$type<JsonRecord>().default(sql`'{}'::jsonb`).notNull(),
  },
  (table) => [
    unique("regular_season_matchups_week_team_pair_unique").on(
      table.week,
      table.teamAId,
      table.teamBId,
    ),
    // Canonical unordered pair: importers MUST normalize so team_a_id < team_b_id,
    // or (w, A, B) and (w, B, A) could coexist and break backfill idempotency.
    check(
      "regular_season_matchups_ordered_pair",
      sql`${table.teamAId} < ${table.teamBId}`,
    ),
  ],
);

export const syncState = pgTable(
  "sync_state",
  {
    id: integer("id").default(1).primaryKey(),
    lastAttempt: timestamp("last_attempt", timestamps),
    lastSuccess: timestamp("last_success", timestamps),
    lockExpiresAt: timestamp("lock_expires_at", timestamps),
    nextRetryAt: timestamp("next_retry_at", timestamps),
    seedLockStatus: seedLockStatusEnum("seed_lock_status")
      .default("none")
      .notNull(),
    seedsLockedAt: timestamp("seeds_locked_at", timestamps),
    seedsSettledAt: timestamp("seeds_settled_at", timestamps),
    seedsSnapshot: jsonb("seeds_snapshot").$type<JsonRecord>(),
  },
  (table) => [check("sync_state_single_row", sql`${table.id} = 1`)],
);

export type Team = InferSelectModel<typeof teams>;
export type NewTeam = InferInsertModel<typeof teams>;
export type LeagueSettings = InferSelectModel<typeof leagueSettings>;
export type NewLeagueSettings = InferInsertModel<typeof leagueSettings>;
