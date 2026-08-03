import "server-only";

import { asc, desc, eq } from "drizzle-orm";

import { getDb, MissingDatabaseUrlError } from "@/db";
import {
  matchups,
  syncRuns,
  syncState,
  teams as teamsTable,
} from "@/db/schema";

export type AdminTeamRef = {
  id: string;
  name: string;
  currentRank: number;
  finalSeed: number | null;
};

export type AdminMatchup = {
  id: string;
  round: number;
  week: number;
  status: "pending" | "live" | "provisional" | "under_review" | "final";
  highTeam: AdminTeamRef | null;
  lowTeam: AdminTeamRef | null;
  computedWinner: AdminTeamRef | null;
  overrideWinner: AdminTeamRef | null;
  computedTally: Record<string, unknown> | null;
  decidedBy: string | null;
  lockedAt: Date | null;
  settledAt: Date | null;
  overrideNote: string | null;
  overriddenAt: Date | null;
};

export type AdminSyncRun = {
  id: number;
  trigger: "visit" | "cron" | "admin" | "backfill";
  status: "running" | "success" | "error";
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  error: string | null;
  detail: Record<string, unknown>;
};

export type AdminSyncState = {
  lastAttempt: Date | null;
  lastSuccess: Date | null;
  lockExpiresAt: Date | null;
  nextRetryAt: Date | null;
  seedLockStatus: "none" | "provisional" | "under_review" | "settled";
  seedsLockedAt: Date | null;
  seedsSettledAt: Date | null;
  seedsSnapshot: Record<string, unknown> | null;
};

export type AdminDashboardData =
  | {
      status: "awaiting";
      reason: string;
      syncRuns: [];
      matchups: [];
      syncState: null;
    }
  | {
      status: "ready";
      syncRuns: AdminSyncRun[];
      matchups: AdminMatchup[];
      syncState: AdminSyncState | null;
    };

function isMissingRelation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "42P01"
  );
}

function teamRef(
  id: string | null,
  teamsById: Map<string, AdminTeamRef>,
): AdminTeamRef | null {
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

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  try {
    const db = getDb();
    const [runRows, stateRows, matchupRows, teamRows] = await Promise.all([
      db.select().from(syncRuns).orderBy(desc(syncRuns.id)).limit(20),
      db.select().from(syncState).where(eq(syncState.id, 1)).limit(1),
      db
        .select()
        .from(matchups)
        .orderBy(asc(matchups.round), asc(matchups.id)),
      db
        .select({
          id: teamsTable.id,
          name: teamsTable.name,
          currentRank: teamsTable.currentRank,
          finalSeed: teamsTable.finalSeed,
        })
        .from(teamsTable),
    ]);
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

    return {
      status: "ready",
      syncRuns: runRows.map((run) => ({
        id: run.id,
        trigger: run.trigger,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        durationMs: run.durationMs,
        error: run.error,
        detail: run.detail,
      })),
      syncState: stateRows[0]
        ? {
            lastAttempt: stateRows[0].lastAttempt,
            lastSuccess: stateRows[0].lastSuccess,
            lockExpiresAt: stateRows[0].lockExpiresAt,
            nextRetryAt: stateRows[0].nextRetryAt,
            seedLockStatus: stateRows[0].seedLockStatus,
            seedsLockedAt: stateRows[0].seedsLockedAt,
            seedsSettledAt: stateRows[0].seedsSettledAt,
            seedsSnapshot: stateRows[0].seedsSnapshot,
          }
        : null,
      matchups: matchupRows.map((matchup) => ({
        id: matchup.id,
        round: matchup.round,
        week: matchup.week,
        status: matchup.status,
        highTeam: teamRef(matchup.highTeamId, teamsById),
        lowTeam: teamRef(matchup.lowTeamId, teamsById),
        computedWinner: teamRef(matchup.computedWinnerTeamId, teamsById),
        overrideWinner: teamRef(matchup.overrideWinnerTeamId, teamsById),
        computedTally: matchup.computedTally,
        decidedBy: matchup.decidedBy,
        lockedAt: matchup.lockedAt,
        settledAt: matchup.settledAt,
        overrideNote: matchup.overrideNote,
        overriddenAt: matchup.overriddenAt,
      })),
    };
  } catch (error) {
    if (error instanceof MissingDatabaseUrlError) {
      return {
        status: "awaiting",
        reason: "DATABASE_URL is not configured.",
        syncRuns: [],
        matchups: [],
        syncState: null,
      };
    }

    if (isMissingRelation(error)) {
      return {
        status: "awaiting",
        reason: "Database tables are not migrated yet.",
        syncRuns: [],
        matchups: [],
        syncState: null,
      };
    }

    throw error;
  }
}
