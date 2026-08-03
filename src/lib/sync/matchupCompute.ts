import "server-only";

import { asc, eq, sql } from "drizzle-orm";

import { LEAGUE_CONFIG } from "@/config/league";
import { getDb, type Db } from "@/db";
import {
  leagueSettings,
  matchups,
  regularSeasonMatchups,
  statLines,
  teams as teamsTable,
} from "@/db/schema";
import { jsonFingerprint } from "@/lib/admin/state";
import {
  decideRoundAdvancement,
  decideMatchupComputation,
  decideNextMatchupProcessingStep,
  type MatchupComputationDecision,
  type MatchupForProcessing,
  type MatchupProcessingSnapshot,
  type MatchupProcessingStep,
  type RoundAdvancementDecision,
} from "@/lib/bracket/matchupProcessor";
import {
  transitionMatchupState,
  type MatchupStatus,
} from "@/lib/bracket/stateMachine";

type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
type DbWriter = Db | Transaction;

export type MatchupComputeStepResult = {
  type: "matchup" | "advancement";
  action: string;
  id: string;
  applied: boolean;
  reason: string | null;
  sideEffects: string[];
};

export type MatchupComputeProcessResult = {
  action: "none" | "processed";
  reason: string | null;
  applied: boolean;
  wroteData: boolean;
  steps: MatchupComputeStepResult[];
};

export type MatchupSettleResult =
  | {
      ok: true;
      notice:
        | "matchup_confirmed"
        | "matchup_settled"
        | "matchup_under_review"
        | "matchup_window_open";
    }
  | {
      ok: false;
      error:
        | "invalid_state"
        | "missing_lock_time"
        | "missing_matchup"
        | "stale_state";
    };

export type MatchupOverrideResult =
  | {
      ok: true;
      notice: "override_saved";
    }
  | {
      ok: false;
      error:
        | "invalid_state"
        | "invalid_winner"
        | "missing_matchup"
        | "stale_state";
    };

const MAX_MATCHUP_PROCESSING_STEPS = 32;

function sideEffectNames(
  decision: Pick<
    MatchupComputationDecision | RoundAdvancementDecision,
    "sideEffects"
  >,
): string[] {
  // Pause/resume effects are reported; status guards and advancement replay control branches.
  return decision.sideEffects.map((effect) => effect.type);
}

function toBracketRound(round: number): 1 | 2 | 3 {
  if (round === 1 || round === 2 || round === 3) {
    return round;
  }

  throw new Error(`Unsupported Loser Bowl matchup round ${round}`);
}

async function loadMatchupSnapshot(
  reader: DbWriter,
  now: Date,
): Promise<
  | { ok: true; snapshot: MatchupProcessingSnapshot }
  | { ok: false; reason: "missing_league_settings" }
> {
  const [settingsRows, matchupRows, statLineRows, teamRows, regularRows] =
    await Promise.all([
      reader
        .select()
        .from(leagueSettings)
        .where(eq(leagueSettings.season, LEAGUE_CONFIG.season))
        .limit(1),
      reader
        .select()
        .from(matchups)
        .orderBy(asc(matchups.round), asc(matchups.id)),
      reader.select().from(statLines),
      reader
        .select({
          id: teamsTable.id,
          finalSeed: teamsTable.finalSeed,
          regularSeasonOutcomeTotals: teamsTable.regularSeasonOutcomeTotals,
        })
        .from(teamsTable),
      reader.select().from(regularSeasonMatchups),
    ]);
  const settings = settingsRows[0];

  if (settings === undefined) {
    return { ok: false, reason: "missing_league_settings" };
  }

  return {
    ok: true,
    snapshot: {
      now,
      leagueSettings: {
        statCategories: settings.statCategories,
        minInningsPitched: settings.minInningsPitched,
      },
      matchups: matchupRows.map((matchup): MatchupForProcessing => ({
        id: matchup.id,
        round: toBracketRound(matchup.round),
        week: matchup.week,
        highTeamId: matchup.highTeamId,
        lowTeamId: matchup.lowTeamId,
        status: matchup.status,
        computedTally: matchup.computedTally,
        computedWinnerTeamId: matchup.computedWinnerTeamId,
        decidedBy: matchup.decidedBy,
        lockedAt: matchup.lockedAt,
        settledAt: matchup.settledAt,
        overrideWinnerTeamId: matchup.overrideWinnerTeamId,
      })),
      statLines: statLineRows.map((line) => ({
        teamId: line.teamId,
        week: line.week,
        stats: line.stats,
      })),
      teams: teamRows.map((team) => ({
        id: team.id,
        finalSeed: team.finalSeed,
        regularSeasonOutcomeTotals: team.regularSeasonOutcomeTotals,
      })),
      regularSeasonMatchups: regularRows.map((row) => ({
        teamAId: row.teamAId,
        teamBId: row.teamBId,
        winnerTeamId: row.winnerTeamId,
      })),
    },
  };
}

async function applyMatchupDecision(
  writer: DbWriter,
  decision: Exclude<MatchupComputationDecision, { action: "none" }>,
): Promise<{ applied: boolean; reason: string | null }> {
  const expectedWhere = sql`${matchups.id} = ${decision.matchupId}
    AND ${matchups.status} = ${decision.expectedStatus}
    AND ${matchups.highTeamId} = ${decision.expectedHighTeamId}
    AND ${matchups.lowTeamId} = ${decision.expectedLowTeamId}`;

  if (decision.action === "record_provisional") {
    const updated = await writer
      .update(matchups)
      .set({
        status: decision.status,
        computedTally: decision.computed.computedTally,
        computedWinnerTeamId: decision.computed.computedWinnerTeamId,
        decidedBy: decision.computed.decidedBy,
        lockedAt: decision.lockedAt,
        settledAt: null,
        overrideWinnerTeamId: null,
        overrideNote: null,
        overriddenAt: null,
      })
      .where(expectedWhere)
      .returning({ id: matchups.id });

    return {
      applied: updated.length > 0,
      reason: updated.length > 0 ? null : "stale_state",
    };
  }

  if (decision.action === "update_provisional") {
    const updated = await writer
      .update(matchups)
      .set({
        computedTally: decision.computed.computedTally,
        computedWinnerTeamId: decision.computed.computedWinnerTeamId,
        decidedBy: decision.computed.decidedBy,
      })
      .where(expectedWhere)
      .returning({ id: matchups.id });

    return {
      applied: updated.length > 0,
      reason: updated.length > 0 ? null : "stale_state",
    };
  }

  if (decision.action === "settle") {
    const updated = await writer
      .update(matchups)
      .set({
        status: decision.status,
        computedTally: decision.computed.computedTally,
        computedWinnerTeamId: decision.computed.computedWinnerTeamId,
        decidedBy: decision.computed.decidedBy,
        settledAt: decision.settledAt,
      })
      .where(expectedWhere)
      .returning({ id: matchups.id });

    return {
      applied: updated.length > 0,
      reason: updated.length > 0 ? null : "stale_state",
    };
  }

  const updated = await writer
    .update(matchups)
    .set({
      status: decision.status,
    })
    .where(expectedWhere)
    .returning({ id: matchups.id });

  return {
    applied: updated.length > 0,
    reason: updated.length > 0 ? null : "stale_state",
  };
}

async function applyAdvancementDecision(
  writer: DbWriter,
  decision: Exclude<RoundAdvancementDecision, { action: "none" }>,
): Promise<{ applied: boolean; reason: string | null }> {
  let updatedCount = 0;

  for (const target of decision.targets) {
    const updated = await writer
      .update(matchups)
      .set({
        round: target.round,
        week: target.week,
        highTeamId: target.highTeamId,
        lowTeamId: target.lowTeamId,
        status: "pending",
        computedTally: null,
        computedWinnerTeamId: null,
        decidedBy: null,
        lockedAt: null,
        settledAt: null,
        overrideWinnerTeamId: null,
        overrideNote: null,
        overriddenAt: null,
      })
      .where(
        sql`${matchups.id} = ${target.id}
          AND ${matchups.round} = ${target.round}
          AND ${matchups.status} IN ('pending', 'live')
          AND (
            ${matchups.highTeamId} IS DISTINCT FROM ${target.highTeamId}
            OR ${matchups.lowTeamId} IS DISTINCT FROM ${target.lowTeamId}
          )`,
      )
      .returning({ id: matchups.id });

    updatedCount += updated.length;
  }

  return {
    applied: updatedCount > 0,
    reason: updatedCount > 0 ? null : "stale_state",
  };
}

async function applyStep(
  step: Exclude<MatchupProcessingStep, { type: "none" }>,
): Promise<MatchupComputeStepResult> {
  const db = getDb();

  return db.transaction(async (tx) => {
    if (step.type === "matchup") {
      const result = await applyMatchupDecision(tx, step.decision);

      return {
        type: step.type,
        action: step.decision.action,
        id: step.decision.matchupId,
        applied: result.applied,
        reason: result.reason,
        sideEffects: sideEffectNames(step.decision),
      };
    }

    const result = await applyAdvancementDecision(tx, step.decision);

    return {
      type: step.type,
      action: step.decision.action,
      id: `round-${step.decision.sourceRound}`,
      applied: result.applied,
      reason: result.reason,
      sideEffects: sideEffectNames(step.decision),
    };
  });
}

export async function processMatchups(
  options: { now?: () => Date } = {},
): Promise<MatchupComputeProcessResult> {
  const now = options.now?.() ?? new Date();
  const db = getDb();
  const steps: MatchupComputeStepResult[] = [];

  for (let index = 0; index < MAX_MATCHUP_PROCESSING_STEPS; index += 1) {
    const loaded = await loadMatchupSnapshot(db, now);

    if (!loaded.ok) {
      return {
        action: steps.length > 0 ? "processed" : "none",
        reason: loaded.reason,
        applied: steps.some((step) => step.applied),
        wroteData: steps.some((step) => step.applied),
        steps,
      };
    }

    const step = decideNextMatchupProcessingStep(loaded.snapshot);

    if (step.type === "none") {
      return {
        action: steps.length > 0 ? "processed" : "none",
        reason: null,
        applied: steps.some((entry) => entry.applied),
        wroteData: steps.some((entry) => entry.applied),
        steps,
      };
    }

    steps.push(await applyStep(step));
  }

  throw new Error("Matchup processing exceeded the maximum step count");
}

async function processAdvancementsOnly(
  options: { now?: () => Date } = {},
): Promise<void> {
  const now = options.now?.() ?? new Date();
  const db = getDb();

  for (let index = 0; index < 4; index += 1) {
    const loaded = await loadMatchupSnapshot(db, now);

    if (!loaded.ok) {
      return;
    }

    const roundOneDecision = decideRoundAdvancement({
      sourceRound: 1,
      matchups: loaded.snapshot.matchups,
      teams: loaded.snapshot.teams,
    });
    const decision =
      roundOneDecision.action !== "none"
        ? roundOneDecision
        : decideRoundAdvancement({
            sourceRound: 2,
            matchups: loaded.snapshot.matchups,
            teams: loaded.snapshot.teams,
          });

    if (decision.action === "none") {
      return;
    }

    const result = await db.transaction((tx) =>
      applyAdvancementDecision(tx, decision),
    );

    if (!result.applied) {
      return;
    }
  }
}

export async function processMatchupById(
  matchupId: string,
  options: { now?: () => Date } = {},
): Promise<MatchupComputeStepResult | { type: "none"; reason: string }> {
  const now = options.now?.() ?? new Date();
  const db = getDb();
  const loaded = await loadMatchupSnapshot(db, now);

  if (!loaded.ok) {
    return { type: "none", reason: loaded.reason };
  }

  const matchup = loaded.snapshot.matchups.find((row) => row.id === matchupId);

  if (matchup === undefined) {
    return { type: "none", reason: "missing_matchup" };
  }

  const decision = decideMatchupComputation({
    matchup,
    statLines: loaded.snapshot.statLines,
    teams: loaded.snapshot.teams,
    regularSeasonMatchups: loaded.snapshot.regularSeasonMatchups,
    leagueSettings: loaded.snapshot.leagueSettings,
    now,
    upstreamUnderReview:
      matchup.round > 1 &&
      loaded.snapshot.matchups.some(
        (candidate) =>
          candidate.round < matchup.round && candidate.status === "under_review",
      ),
  });

  if (decision.action === "none") {
    return { type: "none", reason: decision.reason };
  }

  return applyStep({ type: "matchup", decision });
}

function allowedWinnerIds(matchup: {
  highTeamId: string | null;
  lowTeamId: string | null;
}): string[] {
  return [matchup.highTeamId, matchup.lowTeamId].filter(
    (teamId): teamId is string => teamId !== null,
  );
}

export async function settleMatchupProvisional(
  matchupId: string,
  options: { now?: () => Date } = {},
): Promise<MatchupSettleResult> {
  const now = options.now?.() ?? new Date();
  const db = getDb();
  const matchup = (
    await db.select().from(matchups).where(eq(matchups.id, matchupId)).limit(1)
  )[0];

  if (matchup === undefined) {
    return { ok: false, error: "missing_matchup" };
  }

  if (matchup.status !== "provisional") {
    return { ok: false, error: "invalid_state" };
  }

  if (matchup.lockedAt === null) {
    return { ok: false, error: "missing_lock_time" };
  }

  const result = await processMatchupById(matchupId, { now: () => now });

  if (result.type === "none") {
    if (result.reason === "settle_window_open") {
      return { ok: true, notice: "matchup_window_open" };
    }

    return {
      ok: false,
      error:
        result.reason === "missing_lock_time"
          ? "missing_lock_time"
          : "invalid_state",
    };
  }

  if (!result.applied) {
    return { ok: false, error: "stale_state" };
  }

  if (result.action === "settle") {
    return { ok: true, notice: "matchup_settled" };
  }

  if (result.action === "flag_review") {
    return { ok: true, notice: "matchup_under_review" };
  }

  return { ok: true, notice: "matchup_window_open" };
}

export async function confirmOriginalMatchup(
  matchupId: string,
  options: { now?: () => Date } = {},
): Promise<MatchupSettleResult> {
  const now = options.now?.() ?? new Date();
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const matchup = (
      await tx.select().from(matchups).where(eq(matchups.id, matchupId)).limit(1)
    )[0];

    if (matchup === undefined) {
      return { ok: false as const, error: "missing_matchup" as const };
    }

    if (matchup.status !== "under_review") {
      return { ok: false as const, error: "invalid_state" as const };
    }

    const fingerprint = jsonFingerprint(matchup.computedTally);
    const transition = transitionMatchupState(
      {
        status: matchup.status,
        resultFingerprint: fingerprint,
        computedWinnerTeamId: matchup.computedWinnerTeamId,
        overrideWinnerTeamId: matchup.overrideWinnerTeamId,
        lockedAt: matchup.lockedAt ?? undefined,
        settledAt: matchup.settledAt ?? undefined,
        review: {
          originalWinnerTeamId: matchup.computedWinnerTeamId ?? null,
          correctedWinnerTeamId: matchup.overrideWinnerTeamId ?? null,
          originalResultFingerprint: fingerprint,
          correctedResultFingerprint: fingerprint,
          detectedAt: now,
        },
      },
      { type: "admin_confirm_original" },
      now,
    );

    if (transition.nextState.status !== "final") {
      return { ok: false as const, error: "invalid_state" as const };
    }

    const updated = await tx
      .update(matchups)
      .set({
        status: transition.nextState.status,
        computedWinnerTeamId: transition.nextState.computedWinnerTeamId ?? null,
        overrideWinnerTeamId: null,
        overrideNote: null,
        overriddenAt: null,
        settledAt: transition.nextState.settledAt ?? now,
      })
      .where(
        sql`${matchups.id} = ${matchupId}
          AND ${matchups.status} = 'under_review'`,
      )
      .returning({ id: matchups.id });

    if (updated.length === 0) {
      return { ok: false as const, error: "stale_state" as const };
    }

    return { ok: true as const, notice: "matchup_confirmed" as const };
  });

  if (result.ok) {
    await processAdvancementsOnly({ now: () => now });
  }

  return result;
}

export async function overrideMatchupWinner(
  input: {
    matchupId: string;
    winnerTeamId: string;
    overrideNote: string;
  },
  options: { now?: () => Date } = {},
): Promise<MatchupOverrideResult> {
  const now = options.now?.() ?? new Date();
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const matchup = (
      await tx
        .select()
        .from(matchups)
        .where(eq(matchups.id, input.matchupId))
        .limit(1)
    )[0];

    if (matchup === undefined) {
      return { ok: false as const, error: "missing_matchup" as const };
    }

    if (!allowedWinnerIds(matchup).includes(input.winnerTeamId)) {
      return { ok: false as const, error: "invalid_winner" as const };
    }

    if (matchup.status !== "final" && matchup.status !== "under_review") {
      return { ok: false as const, error: "invalid_state" as const };
    }

    const update =
      matchup.status === "under_review"
        ? {
            ...underReviewOverrideUpdate(matchup, input.winnerTeamId, now),
            overrideNote: input.overrideNote,
            overriddenAt: now,
          }
        : {
            overrideWinnerTeamId: input.winnerTeamId,
            overrideNote: input.overrideNote,
            overriddenAt: now,
          };
    const updated = await tx
      .update(matchups)
      .set(update)
      .where(
        sql`${matchups.id} = ${input.matchupId}
          AND ${matchups.status} = ${matchup.status}`,
      )
      .returning({ id: matchups.id });

    if (updated.length === 0) {
      return { ok: false as const, error: "stale_state" as const };
    }

    return { ok: true as const, notice: "override_saved" as const };
  });

  if (result.ok) {
    await processAdvancementsOnly({ now: () => now });
  }

  return result;
}

function underReviewOverrideUpdate(
  matchup: {
    status: MatchupStatus;
    computedTally: unknown;
    computedWinnerTeamId: string | null;
    overrideWinnerTeamId: string | null;
    lockedAt: Date | null;
    settledAt: Date | null;
  },
  winnerTeamId: string,
  now: Date,
) {
  const fingerprint = jsonFingerprint(matchup.computedTally);
  const transition = transitionMatchupState(
    {
      status: matchup.status,
      resultFingerprint: fingerprint,
      computedWinnerTeamId: matchup.computedWinnerTeamId,
      overrideWinnerTeamId: matchup.overrideWinnerTeamId,
      lockedAt: matchup.lockedAt ?? undefined,
      settledAt: matchup.settledAt ?? undefined,
      review: {
        originalWinnerTeamId: matchup.computedWinnerTeamId ?? null,
        correctedWinnerTeamId: winnerTeamId,
        originalResultFingerprint: fingerprint,
        correctedResultFingerprint: fingerprint,
        detectedAt: now,
      },
    },
    { type: "admin_override_corrected" },
    now,
  );

  return {
    status: transition.nextState.status,
    computedWinnerTeamId: transition.nextState.computedWinnerTeamId ?? null,
    overrideWinnerTeamId: winnerTeamId,
    settledAt: transition.nextState.settledAt ?? now,
  };
}
