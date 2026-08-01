CREATE TYPE "public"."league_settings_source" AS ENUM('yahoo', 'seed');--> statement-breakpoint
CREATE TYPE "public"."matchup_status" AS ENUM('pending', 'live', 'provisional', 'under_review', 'final');--> statement-breakpoint
CREATE TYPE "public"."regular_season_matchup_source" AS ENUM('yahoo', 'import');--> statement-breakpoint
CREATE TYPE "public"."seed_lock_status" AS ENUM('none', 'provisional', 'under_review', 'settled');--> statement-breakpoint
CREATE TYPE "public"."stat_line_source" AS ENUM('yahoo', 'manual', 'import');--> statement-breakpoint
CREATE TYPE "public"."sync_run_status" AS ENUM('running', 'success', 'error');--> statement-breakpoint
CREATE TYPE "public"."sync_run_trigger" AS ENUM('visit', 'cron', 'admin', 'backfill');--> statement-breakpoint
CREATE TABLE "league_settings" (
	"season" integer PRIMARY KEY NOT NULL,
	"stat_categories" jsonb NOT NULL,
	"min_innings_pitched" numeric(5, 2),
	"playoff_start_week" integer NOT NULL,
	"source" "league_settings_source" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matchups" (
	"id" text PRIMARY KEY NOT NULL,
	"round" integer NOT NULL,
	"week" integer NOT NULL,
	"high_team_id" text,
	"low_team_id" text,
	"status" "matchup_status" DEFAULT 'pending' NOT NULL,
	"computed_tally" jsonb,
	"computed_winner_team_id" text,
	"decided_by" text,
	"locked_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"override_winner_team_id" text,
	"override_note" text,
	"overridden_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scope" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_tokens_single_row" CHECK ("oauth_tokens"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "regular_season_matchups" (
	"week" integer NOT NULL,
	"team_a_id" text NOT NULL,
	"team_b_id" text NOT NULL,
	"winner_team_id" text,
	"team_a_category_wins" integer,
	"team_b_category_wins" integer,
	"tied_categories" integer,
	"source" "regular_season_matchup_source" NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "regular_season_matchups_week_team_pair_unique" UNIQUE("week","team_a_id","team_b_id"),
	CONSTRAINT "regular_season_matchups_ordered_pair" CHECK ("regular_season_matchups"."team_a_id" < "regular_season_matchups"."team_b_id")
);
--> statement-breakpoint
CREATE TABLE "stat_lines" (
	"team_id" text NOT NULL,
	"week" integer NOT NULL,
	"stats" jsonb NOT NULL,
	"source" "stat_line_source" NOT NULL,
	"sync_run_id" integer,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stat_lines_team_week_pk" PRIMARY KEY("team_id","week")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"trigger" "sync_run_trigger" NOT NULL,
	"status" "sync_run_status" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"error" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"last_attempt" timestamp with time zone,
	"last_success" timestamp with time zone,
	"lock_expires_at" timestamp with time zone,
	"next_retry_at" timestamp with time zone,
	"seed_lock_status" "seed_lock_status" DEFAULT 'none' NOT NULL,
	"seeds_locked_at" timestamp with time zone,
	"seeds_settled_at" timestamp with time zone,
	"seeds_snapshot" jsonb,
	CONSTRAINT "sync_state_single_row" CHECK ("sync_state"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"yahoo_team_key" text,
	"name" text NOT NULL,
	"current_rank" integer NOT NULL,
	"final_seed" integer,
	"regular_season_outcome_totals" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matchups" ADD CONSTRAINT "matchups_high_team_id_teams_id_fk" FOREIGN KEY ("high_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchups" ADD CONSTRAINT "matchups_low_team_id_teams_id_fk" FOREIGN KEY ("low_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchups" ADD CONSTRAINT "matchups_computed_winner_team_id_teams_id_fk" FOREIGN KEY ("computed_winner_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchups" ADD CONSTRAINT "matchups_override_winner_team_id_teams_id_fk" FOREIGN KEY ("override_winner_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regular_season_matchups" ADD CONSTRAINT "regular_season_matchups_team_a_id_teams_id_fk" FOREIGN KEY ("team_a_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regular_season_matchups" ADD CONSTRAINT "regular_season_matchups_team_b_id_teams_id_fk" FOREIGN KEY ("team_b_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regular_season_matchups" ADD CONSTRAINT "regular_season_matchups_winner_team_id_teams_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stat_lines" ADD CONSTRAINT "stat_lines_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stat_lines" ADD CONSTRAINT "stat_lines_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "teams_yahoo_team_key_unique" ON "teams" USING btree ("yahoo_team_key");