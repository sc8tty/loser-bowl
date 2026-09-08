import "server-only";

import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { after } from "next/server";

import type { StatCategory } from "@/config/categories.seed";
import { LEAGUE_CONFIG } from "@/config/league";
import { getDb, MissingDatabaseUrlError } from "@/db";
import {
  leagueSettings,
  matchups,
  statLines,
  syncRuns,
  syncState,
  teams as teamsTable,
} from "@/db/schema";
import { computeLiveTally } from "@/lib/bracket/liveTally";
import { phase, type BracketPhase } from "@/lib/bracket/phase";
import { decideSeedLock } from "@/lib/bracket/seedLockProcessor";
import {
  emptyPublicMatchup,
  parseComputedTally,
  toDecidedBy,
  toPublicMatchupId,
  type PublicLiveTally,
  type PublicMatchup,
  type PublicMatchupId,
  type PublicStatCategory,
  type PublicTeamRef,
} from "@/lib/public/matchups";
import {
  getE2eLeagueData,
  getE2eMatchupDetailData,
} from "@/lib/testing/e2eFixtures";
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
  | {
      status: "awaiting";
      teams: [];
      phase: "race";
      lastSuccessAt: null;
      lastUpdatedAt: null;
    }
  | {
      status: "ready";
      teams: LeagueTeam[];
      matchups: PublicMatchup[];
      phase: BracketPhase;
      lastSuccessAt: Date | null;
      // Public-facing "Updated" freshness: the more recent of the Yahoo sync
      // engine's own success timestamp and any successful manual import
      // (scripts/import-*.ts log to sync_runs too) — lastSuccessAt alone only
      // ever reflects Yahoo, so it stays "—" forever during manual mode even
      // right after a real import lands (Scott caught this 2026-09-07).
      lastUpdatedAt: Date | null;
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

type StatLineRow = {
  teamId: string;
  week: number;
  stats: Record<string, unknown>;
  syncedAt: Date | null;
};

type LiveTallyContext = {
  statLines: readonly StatLineRow[];
  statCategories: readonly StatCategory[] | null;
  now: Date;
};

const BOWL_WEEKS: number[] = LEAGUE_CONFIG.rounds.map((round) => round.week);

/**
 * "Updated" must mean the data changed. Every visit-triggered sync logs a
 * success row even when its source wrote nothing (a no-op every ~30 min in
 * bracket phase), so only data-writing runs count: the import scripts
 * (trigger "backfill") and engine runs whose detail says wroteData.
 */
const dataChangingSuccessRun = and(
  eq(syncRuns.status, "success"),
  or(
    eq(syncRuns.trigger, "backfill"),
    sql`${syncRuns.detail}->>'wroteData' = 'true'`,
  ),
);

function liveTallyFor(
  matchup: MatchupRow,
  context: LiveTallyContext,
): PublicLiveTally | null {
  if (context.statCategories === null) {
    return null;
  }

  try {
    return computeLiveTally({
      matchup: {
        round: toPublicRound(matchup.round),
        week: matchup.week,
        status: matchup.status,
        highTeamId: matchup.highTeamId,
        lowTeamId: matchup.lowTeamId,
      },
      statLines: context.statLines,
      leagueSettings: { statCategories: context.statCategories },
      now: context.now,
    });
  } catch (error) {
    // A malformed imported value must not take the public page down; the
    // engine's final-mode compute still refuses it loudly at week close.
    console.warn(`live tally skipped for matchup ${matchup.id}:`, error);

    return null;
  }
}

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

function latestOf(a: Date | null, b: Date | null): Date | null {
  if (a === null) return b;
  if (b === null) return a;

  return a.getTime() >= b.getTime() ? a : b;
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
  liveContext: LiveTallyContext,
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
        liveTally: liveTallyFor(matchup, liveContext),
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
export async function getLeagueData(
  e2eScenarioHeader?: string | null,
): Promise<LeagueData> {
  // E2E fixture mode keeps smoke tests off Neon; inert unless E2E_TEST_MODE is true.
  const e2eData = getE2eLeagueData(e2eScenarioHeader);

  if (e2eData !== null) {
    return e2eData;
  }

  const now = new Date();

  try {
    const db = getDb();

    const [
      teamRows,
      stateRows,
      matchupRows,
      lastSuccessfulRunRows,
      statLineRows,
      settingsRows,
    ] = await Promise.all([
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
        .select({ finishedAt: syncRuns.finishedAt })
        .from(syncRuns)
        .where(dataChangingSuccessRun)
        .orderBy(desc(syncRuns.finishedAt))
        .limit(1),
      db
        .select({
          teamId: statLines.teamId,
          week: statLines.week,
          stats: statLines.stats,
          syncedAt: statLines.syncedAt,
        })
        .from(statLines)
        .where(inArray(statLines.week, BOWL_WEEKS)),
      db
        .select({ statCategories: leagueSettings.statCategories })
        .from(leagueSettings)
        .where(eq(leagueSettings.season, LEAGUE_CONFIG.season))
        .limit(1),
    ]);

    if (teamRows.length === 0) {
      return {
        status: "awaiting",
        teams: [],
        phase: "race",
        lastSuccessAt: null,
        lastUpdatedAt: null,
      };
    }

    const lastSuccessAt = stateRows[0]?.lastSuccess ?? null;
    // Any successful sync_runs row counts here — the Yahoo engine and the
    // manual import scripts (scripts/import-*.ts) both log to it, so this
    // reflects real data freshness during manual mode too, not just Yahoo.
    const lastUpdatedAt = latestOf(
      lastSuccessAt,
      lastSuccessfulRunRows[0]?.finishedAt ?? null,
    );

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
      lastUpdatedAt,
      matchups: publicMatchups(matchupRows, teamRows, {
        statLines: statLineRows,
        statCategories: settingsRows[0]?.statCategories ?? null,
        now,
      }),
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
      return {
        status: "awaiting",
        teams: [],
        phase: "race",
        lastSuccessAt: null,
        lastUpdatedAt: null,
      };
    }

    throw error;
  }
}

export async function getMatchupDetailData(
  matchupId: string,
  e2eScenarioHeader?: string | null,
): Promise<MatchupDetailData> {
  const id = toPublicMatchupId(matchupId);

  if (id === null) {
    return { status: "unknown_matchup", matchupId };
  }

  // E2E fixture mode keeps smoke tests off Neon; inert unless E2E_TEST_MODE is true.
  const e2eData = getE2eMatchupDetailData(id, e2eScenarioHeader);

  if (e2eData !== null) {
    return e2eData;
  }

  const now = new Date();

  try {
    const db = getDb();
    const [teamRows, stateRows, matchupRows, settingsRows, statLineRows] =
      await Promise.all([
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
        db
          .select({
            teamId: statLines.teamId,
            week: statLines.week,
            stats: statLines.stats,
            syncedAt: statLines.syncedAt,
          })
          .from(statLines)
          .where(inArray(statLines.week, BOWL_WEEKS)),
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

    const statCategories = settingsRows[0]?.statCategories ?? [];
    const matchupsForPublic = publicMatchups(matchupRows, teamRows, {
      statLines: statLineRows,
      statCategories: settingsRows[0]?.statCategories ?? null,
      now,
    });
    const matchup =
      matchupsForPublic.find((candidate) => candidate.id === id) ?? null;

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
