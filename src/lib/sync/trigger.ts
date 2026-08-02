import "server-only";

import { asc, eq } from "drizzle-orm";
import { after } from "next/server";

import { LEAGUE_CONFIG } from "@/config/league";
import { getDb, MissingDatabaseUrlError } from "@/db";
import { matchups, syncState, teams as teamsTable } from "@/db/schema";
import { phase, type BracketPhase } from "@/lib/bracket/phase";
import { runSync } from "./engine";
import { isStale } from "./freshness";
import { dbSyncDeps } from "./lock";

export type LeagueTeam = {
  id: string;
  name: string;
  currentRank: number;
  wins: number;
  losses: number;
  ties: number;
};

export type LeagueData =
  | { status: "awaiting"; teams: []; phase: "race"; lastSuccessAt: null }
  | {
      status: "ready";
      teams: LeagueTeam[];
      phase: BracketPhase;
      lastSuccessAt: Date | null;
    };

function isMissingRelation(error: unknown): boolean {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;

  if (code === "42P01") {
    console.warn(
      "league relations missing (42P01) — rendering awaiting state. Has the migration been applied?",
    );
    return true;
  }

  return false;
}

/**
 * The single data entry point for pages. Renders instantly from Postgres and,
 * when the data is stale for the current phase, schedules a post-response
 * sync via after() — never blocking the response (PRD sync section).
 */
export async function getLeagueData(): Promise<LeagueData> {
  const now = new Date();

  try {
    const db = getDb();

    const [teamRows, stateRows, finalRows] = await Promise.all([
      db
        .select({
          id: teamsTable.id,
          name: teamsTable.name,
          currentRank: teamsTable.currentRank,
          outcomeTotals: teamsTable.regularSeasonOutcomeTotals,
        })
        .from(teamsTable)
        .orderBy(asc(teamsTable.currentRank)),
      db.select().from(syncState).where(eq(syncState.id, 1)),
      db.select().from(matchups).where(eq(matchups.id, "final")),
    ]);

    if (teamRows.length === 0) {
      return { status: "awaiting", teams: [], phase: "race", lastSuccessAt: null };
    }

    const lastSuccessAt = stateRows[0]?.lastSuccess ?? null;
    const finalMatchup = finalRows[0]
      ? {
          status: finalRows[0].status,
          computedWinnerTeamId: finalRows[0].computedWinnerTeamId,
          overrideWinnerTeamId: finalRows[0].overrideWinnerTeamId,
        }
      : null;

    const currentPhase = phase(
      now,
      {
        timeZone: LEAGUE_CONFIG.timeZone,
        bracketLockDate: LEAGUE_CONFIG.bracketLockDate,
      },
      finalMatchup,
    );

    if (isStale(lastSuccessAt, currentPhase, now)) {
      after(async () => {
        await runSync("visit", dbSyncDeps());
      });
    }

    return {
      status: "ready",
      phase: currentPhase,
      lastSuccessAt,
      teams: teamRows.map((row) => ({
        id: row.id,
        name: row.name,
        currentRank: row.currentRank,
        wins: row.outcomeTotals.category_wins ?? 0,
        losses: row.outcomeTotals.category_losses ?? 0,
        ties: row.outcomeTotals.category_ties ?? 0,
      })),
    };
  } catch (error) {
    if (error instanceof MissingDatabaseUrlError || isMissingRelation(error)) {
      return { status: "awaiting", teams: [], phase: "race", lastSuccessAt: null };
    }

    throw error;
  }
}
