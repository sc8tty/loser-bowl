import "server-only";

import { asc, eq, sql } from "drizzle-orm";

import { getDb, type Db } from "@/db";
import { matchups, syncState, teams as teamsTable } from "@/db/schema";
import { jsonFingerprint } from "@/lib/admin/state";
import {
  buildBracketSkeleton,
  decideSeedLock,
  finalSeedAssignments,
  isSeedSnapshot,
  type SeedFinalSeed,
  type SeedLockDecision,
  type SeedLockMatchup,
  type SeedSnapshot,
} from "@/lib/bracket/seedLockProcessor";
import { transitionSeedLockState } from "@/lib/bracket/stateMachine";

type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
type DbWriter = Db | Transaction;

export type SeedLockProcessResult = {
  action: SeedLockDecision["action"];
  reason: string | null;
  applied: boolean;
  wroteData: boolean;
  sideEffects: string[];
};

export type SeedLockReviewAction = "confirm_original" | "relock_corrected";

export type SeedLockReviewResult =
  | {
      ok: true;
      notice: "seed_lock_confirmed" | "seed_lock_relocked";
    }
  | {
      ok: false;
      error:
        | "invalid_state"
        | "missing_corrected_snapshot"
        | "missing_seed_snapshot"
        | "stale_state";
    };

function sideEffectNames(decision: Pick<SeedLockDecision, "sideEffects">): string[] {
  return decision.sideEffects.map((effect) => effect.type);
}

async function writeFinalSeeds(
  writer: DbWriter,
  finalSeeds: readonly SeedFinalSeed[],
): Promise<void> {
  await writer.update(teamsTable).set({ finalSeed: null });

  for (const finalSeed of finalSeeds) {
    await writer
      .update(teamsTable)
      .set({ finalSeed: finalSeed.seed })
      .where(eq(teamsTable.id, finalSeed.teamId));
  }
}

async function insertBracketSkeleton(
  writer: DbWriter,
  matchupRows: readonly SeedLockMatchup[],
): Promise<void> {
  await writer
    .insert(matchups)
    .values([...matchupRows])
    .onConflictDoNothing({ target: matchups.id });
}

async function replaceRoundOnePairings(
  writer: DbWriter,
  snapshot: SeedSnapshot,
): Promise<void> {
  const skeleton = buildBracketSkeleton(snapshot);
  const roundOneRows = skeleton.filter((matchup) => matchup.round === 1);
  const placeholderRows = skeleton.filter((matchup) => matchup.round !== 1);

  await writer
    .insert(matchups)
    .values(roundOneRows)
    .onConflictDoUpdate({
      target: matchups.id,
      set: {
        round: sql`excluded.round`,
        week: sql`excluded.week`,
        highTeamId: sql`excluded.high_team_id`,
        lowTeamId: sql`excluded.low_team_id`,
        status: "pending",
        computedTally: null,
        computedWinnerTeamId: null,
        decidedBy: null,
        lockedAt: null,
        settledAt: null,
        overrideWinnerTeamId: null,
        overrideNote: null,
        overriddenAt: null,
      },
    });

  await writer
    .insert(matchups)
    .values(placeholderRows)
    .onConflictDoNothing({ target: matchups.id });
}

async function applySeedLockDecision(
  decision: SeedLockDecision,
): Promise<SeedLockProcessResult> {
  if (decision.action === "none") {
    return {
      action: decision.action,
      reason: decision.reason,
      applied: false,
      wroteData: false,
      sideEffects: sideEffectNames(decision),
    };
  }

  const db = getDb();

  return db.transaction(async (tx) => {
    if (decision.action === "lock_provisional") {
      const claimed = await tx
        .update(syncState)
        .set({
          seedLockStatus: decision.syncState.seedLockStatus,
          seedsLockedAt: decision.syncState.seedsLockedAt,
          seedsSettledAt: decision.syncState.seedsSettledAt,
          seedsSnapshot: decision.syncState.seedsSnapshot,
          seedsCorrectedSnapshot: decision.syncState.seedsCorrectedSnapshot,
        })
        .where(
          sql`${syncState.id} = 1
            AND ${syncState.seedLockStatus} = 'none'`,
        )
        .returning({ id: syncState.id });

      if (claimed.length === 0) {
        return {
          action: decision.action,
          reason: "stale_state",
          applied: false,
          wroteData: false,
          sideEffects: sideEffectNames(decision),
        };
      }

      await writeFinalSeeds(tx, decision.finalSeeds);
      await insertBracketSkeleton(tx, decision.matchups);

      return {
        action: decision.action,
        reason: null,
        applied: true,
        wroteData: true,
        sideEffects: sideEffectNames(decision),
      };
    }

    if (decision.action === "settle") {
      const claimed = await tx
        .update(syncState)
        .set({
          seedLockStatus: decision.syncState.seedLockStatus,
          seedsSettledAt: decision.syncState.seedsSettledAt,
          seedsCorrectedSnapshot: decision.syncState.seedsCorrectedSnapshot,
        })
        .where(
          sql`${syncState.id} = 1
            AND ${syncState.seedLockStatus} = 'provisional'`,
        )
        .returning({ id: syncState.id });

      return {
        action: decision.action,
        reason: claimed.length === 0 ? "stale_state" : null,
        applied: claimed.length > 0,
        wroteData: claimed.length > 0,
        sideEffects: sideEffectNames(decision),
      };
    }

    const claimed = await tx
      .update(syncState)
      .set({
        seedLockStatus: decision.syncState.seedLockStatus,
        seedsCorrectedSnapshot: decision.syncState.seedsCorrectedSnapshot,
      })
      .where(
        sql`${syncState.id} = 1
          AND ${syncState.seedLockStatus} = 'provisional'`,
      )
      .returning({ id: syncState.id });

    return {
      action: decision.action,
      reason: claimed.length === 0 ? "stale_state" : null,
      applied: claimed.length > 0,
      wroteData: claimed.length > 0,
      sideEffects: sideEffectNames(decision),
    };
  });
}

export async function processSeedLock(options: {
  now?: () => Date;
} = {}): Promise<SeedLockProcessResult> {
  const now = options.now?.() ?? new Date();
  const db = getDb();
  const [teamRows, stateRows] = await Promise.all([
    db
      .select({
        id: teamsTable.id,
        currentRank: teamsTable.currentRank,
      })
      .from(teamsTable)
      .orderBy(asc(teamsTable.currentRank)),
    db.select().from(syncState).where(eq(syncState.id, 1)).limit(1),
  ]);
  const state = stateRows[0];

  if (state === undefined) {
    return {
      action: "none",
      reason: "missing_sync_state",
      applied: false,
      wroteData: false,
      sideEffects: [],
    };
  }

  return applySeedLockDecision(
    decideSeedLock({
      standings: teamRows,
      syncState: {
        seedLockStatus: state.seedLockStatus,
        seedsLockedAt: state.seedsLockedAt,
        seedsSettledAt: state.seedsSettledAt,
        seedsSnapshot: state.seedsSnapshot,
      },
      now,
    }),
  );
}

export async function resolveSeedLockReview(
  action: SeedLockReviewAction,
  options: { now?: () => Date } = {},
): Promise<SeedLockReviewResult> {
  const now = options.now?.() ?? new Date();
  const db = getDb();

  return db.transaction(async (tx) => {
    const state = (
      await tx.select().from(syncState).where(eq(syncState.id, 1)).limit(1)
    )[0];

    if (state?.seedLockStatus !== "under_review") {
      return { ok: false, error: "invalid_state" };
    }

    if (state.seedsSnapshot === null) {
      return { ok: false, error: "missing_seed_snapshot" };
    }

    if (state.seedsCorrectedSnapshot === null) {
      return { ok: false, error: "missing_corrected_snapshot" };
    }

    if (action === "relock_corrected" && !isSeedSnapshot(state.seedsCorrectedSnapshot)) {
      return { ok: false, error: "missing_corrected_snapshot" };
    }

    const originalFingerprint = jsonFingerprint(state.seedsSnapshot);
    const correctedFingerprint = jsonFingerprint(state.seedsCorrectedSnapshot);
    const transition = transitionSeedLockState(
      {
        status: state.seedLockStatus,
        seedFingerprint: originalFingerprint,
        seedsLockedAt: state.seedsLockedAt ?? undefined,
        seedsSettledAt: state.seedsSettledAt ?? undefined,
        review: {
          originalSeedFingerprint: originalFingerprint,
          correctedSeedFingerprint: correctedFingerprint,
          detectedAt: now,
        },
      },
      action === "confirm_original"
        ? { type: "admin_confirm_original" }
        : { type: "admin_relock_corrected" },
      now,
    );

    if (transition.nextState.status !== "settled") {
      return { ok: false, error: "invalid_state" };
    }

    const nextSnapshot =
      action === "relock_corrected"
        ? state.seedsCorrectedSnapshot
        : state.seedsSnapshot;
    const updated = await tx
      .update(syncState)
      .set({
        seedLockStatus: transition.nextState.status,
        seedsSettledAt: transition.nextState.seedsSettledAt ?? now,
        seedsSnapshot: nextSnapshot,
        seedsCorrectedSnapshot: null,
      })
      .where(
        sql`${syncState.id} = 1
          AND ${syncState.seedLockStatus} = 'under_review'`,
      )
      .returning({ id: syncState.id });

    if (updated.length === 0) {
      return { ok: false, error: "stale_state" };
    }

    if (action === "relock_corrected") {
      const correctedSnapshot = state.seedsCorrectedSnapshot;

      if (!isSeedSnapshot(correctedSnapshot)) {
        return { ok: false, error: "missing_corrected_snapshot" };
      }

      await writeFinalSeeds(tx, finalSeedAssignments(correctedSnapshot));
      await replaceRoundOnePairings(tx, correctedSnapshot);
    }

    return {
      ok: true,
      notice:
        action === "confirm_original"
          ? "seed_lock_confirmed"
          : "seed_lock_relocked",
    };
  });
}
