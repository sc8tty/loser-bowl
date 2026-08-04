import "server-only";

import { asc, eq } from "drizzle-orm";
import { after } from "next/server";

import { LEAGUE_CONFIG } from "@/config/league";
import { getDb, MissingDatabaseUrlError } from "@/db";
import {
  leagueSettings,
  matchups,
  syncState,
  teams as teamsTable,
} from "@/db/schema";
import { phase, type BracketPhase } from "@/lib/bracket/phase";
import { decideSeedLock } from "@/lib/bracket/seedLockProcessor";
import {
  emptyPublicMatchup,
  parseComputedTally,
  toDecidedBy,
  toPublicMatchupId,
  type PublicMatchup,
  type PublicMatchupId,
  type PublicStatCategory,
  type PublicTeamRef,
} from "@/lib/public/matchups";
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
      matchups: PublicMatchup[];
      phase: BracketPhase;
      lastSuccessAt: Date | null;
    };

export type MatchupDetailData =
  | {
      status: "unknown_matchup";
      matchupId: string;
    }
  | {
      status: "awaiting";
      reason: string;
      matchupId: PublicMatchupId;
      phase: "race";
      lastSuccessAt: null;
      matchups: [];
      statCategories: [];
    }
  | {
      status: "not_created";
      matchupId: PublicMatchupId;
      matchup: PublicMatchup;
      phase: BracketPhase;
      lastSuccessAt: Date | null;
      matchups: PublicMatchup[];
      statCategories: readonly PublicStatCategory[];
    }
  | {
      status: "ready";
      matchupId: PublicMatchupId;
      matchup: PublicMatchup;
      phase: BracketPhase;
      lastSuccessAt: Date | null;
      matchups: PublicMatchup[];
      statCategories: readonly PublicStatCategory[];
    };

type TeamRow = {
  id: string;
  name: string;
  currentRank: number;
  finalSeed: number | null;
  outcomeTotals: {
    category_wins?: number;
    category_losses?: number;
    category_ties?: number;
  };
};

type MatchupRow = typeof matchups.$inferSelect;

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

function toPublicRound(round: number): 1 | 2 | 3 {
  if (round === 1 || round === 2 || round === 3) {
    return round;
  }

  throw new Error(`Unsupported Loser Bowl matchup round ${round}`);
}

function teamRef(
  id: string | null,
  teamsById: Map<string, PublicTeamRef>,
): PublicTeamRef | null {
  if (id === null) {
    return null;
  }

  return (
    teamsById.get(id) ?? {
      id,
      name: id,
      currentRank: 0,
      finalSeed: null,
    }
  );
}

function publicMatchups(
  matchupRows: readonly MatchupRow[],
  teamRows: readonly TeamRow[],
): PublicMatchup[] {
  const teamsById = new Map(
    teamRows.map((team) => [
      team.id,
      {
        id: team.id,
        name: team.name,
        currentRank: team.currentRank,
        finalSeed: team.finalSeed,
      },
    ]),
  );

  return matchupRows.flatMap((matchup) => {
    const id = toPublicMatchupId(matchup.id);

    if (id === null) {
      return [];
    }

    return [
      {
        id,
        round: toPublicRound(matchup.round),
        week: matchup.week,
        status: matchup.status,
        highTeam: teamRef(matchup.highTeamId, teamsById),
        lowTeam: teamRef(matchup.lowTeamId, teamsById),
        computedWinner: teamRef(matchup.computedWinnerTeamId, teamsById),
        overrideWinner: teamRef(matchup.overrideWinnerTeamId, teamsById),
        computedTally: parseComputedTally(matchup.computedTally),
        decidedBy: toDecidedBy(matchup.decidedBy),
        lockedAt: matchup.lockedAt,
        settledAt: matchup.settledAt,
        overrideNote: matchup.overrideNote,
        overriddenAt: matchup.overriddenAt,
      },
    ];
  });
}

function finalMatchupForPhase(matchupRows: readonly MatchupRow[]) {
  const finalMatchup = matchupRows.find((matchup) => matchup.id === "final");

  return finalMatchup === undefined
    ? null
    : {
        status: finalMatchup.status,
        computedWinnerTeamId: finalMatchup.computedWinnerTeamId,
        overrideWinnerTeamId: finalMatchup.overrideWinnerTeamId,
      };
}

function maybeScheduleVisitSync(input: {
  lastSuccessAt: Date | null;
  currentPhase: BracketPhase;
  teamRows: readonly TeamRow[];
  stateRow: typeof syncState.$inferSelect | undefined;
  now: Date;
}) {
  const seedLockDecision = input.stateRow
    ? decideSeedLock({
        standings: input.teamRows,
        syncState: {
          seedLockStatus: input.stateRow.seedLockStatus,
          seedsLockedAt: input.stateRow.seedsLockedAt,
          seedsSettledAt: input.stateRow.seedsSettledAt,
          seedsSnapshot: input.stateRow.seedsSnapshot,
        },
        now: input.now,
      })
    : null;

  if (
    isStale(input.lastSuccessAt, input.currentPhase, input.now) ||
    (seedLockDecision !== null && seedLockDecision.action !== "none")
  ) {
    after(async () => {
      await runSync("visit", dbSyncDeps());
    });
  }
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

    const [teamRows, stateRows, matchupRows] = await Promise.all([
      db
        .select({
          id: teamsTable.id,
          name: teamsTable.name,
          currentRank: teamsTable.currentRank,
          finalSeed: teamsTable.finalSeed,
          outcomeTotals: teamsTable.regularSeasonOutcomeTotals,
        })
        .from(teamsTable)
        .orderBy(asc(teamsTable.currentRank)),
      db.select().from(syncState).where(eq(syncState.id, 1)),
      db
        .select()
        .from(matchups)
        .orderBy(asc(matchups.round), asc(matchups.id)),
    ]);

    if (teamRows.length === 0) {
      return { status: "awaiting", teams: [], phase: "race", lastSuccessAt: null };
    }

    const lastSuccessAt = stateRows[0]?.lastSuccess ?? null;

    const currentPhase = phase(
      now,
      {
        timeZone: LEAGUE_CONFIG.timeZone,
        bracketLockDate: LEAGUE_CONFIG.bracketLockDate,
      },
      finalMatchupForPhase(matchupRows),
    );

    maybeScheduleVisitSync({
      lastSuccessAt,
      currentPhase,
      teamRows,
      stateRow: stateRows[0],
      now,
    });

    return {
      status: "ready",
      phase: currentPhase,
      lastSuccessAt,
      matchups: publicMatchups(matchupRows, teamRows),
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

export async function getMatchupDetailData(
  matchupId: string,
): Promise<MatchupDetailData> {
  const id = toPublicMatchupId(matchupId);

  if (id === null) {
    return { status: "unknown_matchup", matchupId };
  }

  const now = new Date();

  try {
    const db = getDb();
    const [teamRows, stateRows, matchupRows, settingsRows] = await Promise.all([
      db
        .select({
          id: teamsTable.id,
          name: teamsTable.name,
          currentRank: teamsTable.currentRank,
          finalSeed: teamsTable.finalSeed,
          outcomeTotals: teamsTable.regularSeasonOutcomeTotals,
        })
        .from(teamsTable)
        .orderBy(asc(teamsTable.currentRank)),
      db.select().from(syncState).where(eq(syncState.id, 1)),
      db
        .select()
        .from(matchups)
        .orderBy(asc(matchups.round), asc(matchups.id)),
      db
        .select({
          statCategories: leagueSettings.statCategories,
        })
        .from(leagueSettings)
        .where(eq(leagueSettings.season, LEAGUE_CONFIG.season))
        .limit(1),
    ]);

    if (teamRows.length === 0) {
      return {
        status: "awaiting",
        reason: "League data has not landed yet.",
        matchupId: id,
        phase: "race",
        lastSuccessAt: null,
        matchups: [],
        statCategories: [],
      };
    }

    const lastSuccessAt = stateRows[0]?.lastSuccess ?? null;
    const currentPhase = phase(
      now,
      {
        timeZone: LEAGUE_CONFIG.timeZone,
        bracketLockDate: LEAGUE_CONFIG.bracketLockDate,
      },
      finalMatchupForPhase(matchupRows),
    );

    maybeScheduleVisitSync({
      lastSuccessAt,
      currentPhase,
      teamRows,
      stateRow: stateRows[0],
      now,
    });

    const matchupsForPublic = publicMatchups(matchupRows, teamRows);
    const matchup =
      matchupsForPublic.find((candidate) => candidate.id === id) ?? null;
    const statCategories = settingsRows[0]?.statCategories ?? [];

    if (matchup === null) {
      return {
        status: "not_created",
        matchupId: id,
        matchup: emptyPublicMatchup(id),
        phase: currentPhase,
        lastSuccessAt,
        matchups: matchupsForPublic,
        statCategories,
      };
    }

    return {
      status: "ready",
      matchupId: id,
      matchup,
      phase: currentPhase,
      lastSuccessAt,
      matchups: matchupsForPublic,
      statCategories,
    };
  } catch (error) {
    if (error instanceof MissingDatabaseUrlError) {
      return {
        status: "awaiting",
        reason: "DATABASE_URL is not configured.",
        matchupId: id,
        phase: "race",
        lastSuccessAt: null,
        matchups: [],
        statCategories: [],
      };
    }

    if (isMissingRelation(error)) {
      return {
        status: "awaiting",
        reason: "Database tables are not migrated yet.",
        matchupId: id,
        phase: "race",
        lastSuccessAt: null,
        matchups: [],
        statCategories: [],
      };
    }

    throw error;
  }
}
