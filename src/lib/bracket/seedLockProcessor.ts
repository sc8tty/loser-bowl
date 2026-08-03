import { LEAGUE_CONFIG } from "@/config/league";
import { jsonFingerprint } from "@/lib/admin/state";

import { dateKeyInTimeZone } from "./phase";
import { nextRoundPairings } from "./reseed";
import {
  transitionSeedLockState,
  type SeedLockStatus,
  type StateMachineSideEffect,
} from "./stateMachine";

export type SeedLockStanding = {
  id: string;
  currentRank: number;
};

export type SeedSnapshotTeam = {
  id: string;
  seed: number;
};

export type SeedSnapshot = {
  teams: SeedSnapshotTeam[];
};

export type SeedLockSyncStateInput = {
  seedLockStatus: SeedLockStatus;
  seedsLockedAt: Date | null;
  seedsSettledAt: Date | null;
  seedsSnapshot: unknown;
};

export type SeedLockProcessorConfig = {
  timeZone: string;
  bracketLockDate: string;
  bowlSeeds: readonly number[];
  rounds: readonly { round: 1 | 2 | 3; week: number }[];
};

export type SeedFinalSeed = {
  teamId: string;
  seed: number;
};

export type SeedLockMatchup = {
  id: string;
  round: 1 | 2 | 3;
  week: number;
  highTeamId: string | null;
  lowTeamId: string | null;
  status: "pending";
};

export type SeedLockDecision =
  | {
      action: "none";
      reason:
        | "already_settled"
        | "already_under_review"
        | "before_lock_boundary"
        | "incomplete_bowl_seeds"
        | "missing_lock_time"
        | "missing_original_snapshot"
        | "settle_window_open";
      wroteData: false;
      sideEffects: StateMachineSideEffect[];
    }
  | {
      action: "lock_provisional";
      wroteData: true;
      snapshot: SeedSnapshot;
      fingerprint: string;
      syncState: {
        seedLockStatus: "provisional";
        seedsLockedAt: Date;
        seedsSettledAt: null;
        seedsSnapshot: SeedSnapshot;
        seedsCorrectedSnapshot: null;
      };
      finalSeeds: SeedFinalSeed[];
      matchups: SeedLockMatchup[];
      sideEffects: StateMachineSideEffect[];
    }
  | {
      action: "settle";
      wroteData: true;
      fingerprint: string;
      syncState: {
        seedLockStatus: "settled";
        seedsSettledAt: Date;
        seedsCorrectedSnapshot: null;
      };
      sideEffects: StateMachineSideEffect[];
    }
  | {
      action: "flag_review";
      wroteData: true;
      correctedSnapshot: SeedSnapshot;
      correctedFingerprint: string;
      syncState: {
        seedLockStatus: "under_review";
        seedsCorrectedSnapshot: SeedSnapshot;
      };
      sideEffects: StateMachineSideEffect[];
    };

const ROUND_ONE_MATCHUP_IDS = ["r1m1", "r1m2", "r1m3", "r1m4"] as const;
const ROUND_TWO_MATCHUP_IDS = ["r2m1", "r2m2"] as const;
const FINAL_MATCHUP_ID = "final";

export function isSeedLockBoundaryPassed(
  now: Date,
  config: SeedLockProcessorConfig = LEAGUE_CONFIG,
): boolean {
  return dateKeyInTimeZone(now, config.timeZone) > config.bracketLockDate;
}

export function buildSeedSnapshot(
  standings: readonly SeedLockStanding[],
  config: SeedLockProcessorConfig = LEAGUE_CONFIG,
): SeedSnapshot | null {
  const teamIdsByRank = new Map<number, string[]>();
  const bowlSeedSet = new Set(config.bowlSeeds);

  for (const team of standings) {
    if (!bowlSeedSet.has(team.currentRank)) {
      continue;
    }

    const ids = teamIdsByRank.get(team.currentRank) ?? [];
    ids.push(team.id);
    teamIdsByRank.set(team.currentRank, ids);
  }

  const teams: SeedSnapshotTeam[] = [];

  for (const seed of config.bowlSeeds) {
    const ids = teamIdsByRank.get(seed) ?? [];

    if (ids.length !== 1) {
      return null;
    }

    teams.push({ id: ids[0], seed });
  }

  return { teams };
}

export function seedSnapshotFingerprint(snapshot: SeedSnapshot): string {
  return jsonFingerprint(snapshot);
}

export function isSeedSnapshot(value: unknown): value is SeedSnapshot {
  if (typeof value !== "object" || value === null || !("teams" in value)) {
    return false;
  }

  const teams = (value as { teams: unknown }).teams;

  return (
    Array.isArray(teams) &&
    teams.every(
      (team) =>
        typeof team === "object" &&
        team !== null &&
        "id" in team &&
        "seed" in team &&
        typeof (team as { id: unknown }).id === "string" &&
        typeof (team as { seed: unknown }).seed === "number",
    )
  );
}

export function finalSeedAssignments(snapshot: SeedSnapshot): SeedFinalSeed[] {
  return snapshot.teams.map((team) => ({
    teamId: team.id,
    seed: team.seed,
  }));
}

export function buildBracketSkeleton(
  snapshot: SeedSnapshot,
  config: SeedLockProcessorConfig = LEAGUE_CONFIG,
): SeedLockMatchup[] {
  const [roundOne, roundTwo, finalRound] = config.rounds;

  if (roundOne === undefined || roundTwo === undefined || finalRound === undefined) {
    throw new Error("Seed lock requires three configured Loser Bowl rounds");
  }

  return [
    ...nextRoundPairings(snapshot.teams).map((pairing, index) => ({
      id: ROUND_ONE_MATCHUP_IDS[index],
      round: 1 as const,
      week: roundOne.week,
      highTeamId: pairing.highTeam.id,
      lowTeamId: pairing.lowTeam.id,
      status: "pending" as const,
    })),
    ...ROUND_TWO_MATCHUP_IDS.map((id) => ({
      id,
      round: 2 as const,
      week: roundTwo.week,
      highTeamId: null,
      lowTeamId: null,
      status: "pending" as const,
    })),
    {
      id: FINAL_MATCHUP_ID,
      round: 3 as const,
      week: finalRound.week,
      highTeamId: null,
      lowTeamId: null,
      status: "pending" as const,
    },
  ];
}

export function decideSeedLock(
  input: {
    standings: readonly SeedLockStanding[];
    syncState: SeedLockSyncStateInput;
    now: Date;
    config?: SeedLockProcessorConfig;
  },
): SeedLockDecision {
  const config = input.config ?? LEAGUE_CONFIG;

  if (input.syncState.seedLockStatus === "settled") {
    return {
      action: "none",
      reason: "already_settled",
      wroteData: false,
      sideEffects: [],
    };
  }

  if (input.syncState.seedLockStatus === "under_review") {
    return {
      action: "none",
      reason: "already_under_review",
      wroteData: false,
      sideEffects: [],
    };
  }

  if (input.syncState.seedLockStatus === "none") {
    if (!isSeedLockBoundaryPassed(input.now, config)) {
      return {
        action: "none",
        reason: "before_lock_boundary",
        wroteData: false,
        sideEffects: [],
      };
    }

    const snapshot = buildSeedSnapshot(input.standings, config);

    if (snapshot === null) {
      return {
        action: "none",
        reason: "incomplete_bowl_seeds",
        wroteData: false,
        sideEffects: [],
      };
    }

    const fingerprint = seedSnapshotFingerprint(snapshot);
    const transition = transitionSeedLockState(
      { status: "none" },
      { type: "record_provisional_seed_lock", seedFingerprint: fingerprint },
      input.now,
    );

    if (transition.nextState.status !== "provisional") {
      return {
        action: "none",
        reason: "before_lock_boundary",
        wroteData: false,
        sideEffects: transition.sideEffects,
      };
    }

    return {
      action: "lock_provisional",
      wroteData: true,
      snapshot,
      fingerprint,
      syncState: {
        seedLockStatus: "provisional",
        seedsLockedAt: transition.nextState.seedsLockedAt ?? input.now,
        seedsSettledAt: null,
        seedsSnapshot: snapshot,
        seedsCorrectedSnapshot: null,
      },
      finalSeeds: finalSeedAssignments(snapshot),
      matchups: buildBracketSkeleton(snapshot, config),
      sideEffects: transition.sideEffects,
    };
  }

  const snapshot = buildSeedSnapshot(input.standings, config);

  if (snapshot === null) {
    return {
      action: "none",
      reason: "incomplete_bowl_seeds",
      wroteData: false,
      sideEffects: [],
    };
  }

  if (input.syncState.seedsSnapshot === null) {
    return {
      action: "none",
      reason: "missing_original_snapshot",
      wroteData: false,
      sideEffects: [],
    };
  }

  if (input.syncState.seedsLockedAt === null) {
    return {
      action: "none",
      reason: "missing_lock_time",
      wroteData: false,
      sideEffects: [],
    };
  }

  const originalFingerprint = jsonFingerprint(input.syncState.seedsSnapshot);
  const correctedFingerprint = seedSnapshotFingerprint(snapshot);
  const transition = transitionSeedLockState(
    {
      status: input.syncState.seedLockStatus,
      seedFingerprint: originalFingerprint,
      seedsLockedAt: input.syncState.seedsLockedAt ?? undefined,
      seedsSettledAt: input.syncState.seedsSettledAt ?? undefined,
      review: null,
    },
    { type: "settle_check", seedFingerprint: correctedFingerprint },
    input.now,
  );

  if (transition.nextState.status === "provisional") {
    return {
      action: "none",
      reason: "settle_window_open",
      wroteData: false,
      sideEffects: transition.sideEffects,
    };
  }

  if (transition.nextState.status === "under_review") {
    return {
      action: "flag_review",
      wroteData: true,
      correctedSnapshot: snapshot,
      correctedFingerprint,
      syncState: {
        seedLockStatus: "under_review",
        seedsCorrectedSnapshot: snapshot,
      },
      sideEffects: transition.sideEffects,
    };
  }

  return {
    action: "settle",
    wroteData: true,
    fingerprint: correctedFingerprint,
    syncState: {
      seedLockStatus: "settled",
      seedsSettledAt: transition.nextState.seedsSettledAt ?? input.now,
      seedsCorrectedSnapshot: null,
    },
    sideEffects: transition.sideEffects,
  };
}
