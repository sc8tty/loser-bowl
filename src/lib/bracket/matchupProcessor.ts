import { LEAGUE_CONFIG, type BowlRound } from "@/config/league";
import { jsonFingerprint } from "@/lib/admin/state";

import {
  compareWeek,
  type WeekComparisonResult,
  type WeekStatCategory,
  type WeekStats,
} from "./comparator";
import { dateKeyInTimeZone } from "./phase";
import { nextRoundPairings } from "./reseed";
import {
  transitionMatchupState,
  type MatchupStatus,
  type StateMachineSideEffect,
} from "./stateMachine";
import {
  applyTiebreakers,
  type DecidedBy,
  type OutcomeTotalsLike,
  type RegularSeasonMatchupRow,
  type TiebreakerContext,
} from "./tiebreakers";

export const ROUND_ONE_MATCHUP_IDS = ["r1m1", "r1m2", "r1m3", "r1m4"] as const;
export const ROUND_TWO_MATCHUP_IDS = ["r2m1", "r2m2"] as const;
export const FINAL_MATCHUP_ID = "final";

export type MatchupProcessorConfig = {
  timeZone: string;
  rounds: readonly BowlRound[];
};

export type MatchupForProcessing = {
  id: string;
  round: 1 | 2 | 3;
  week: number;
  highTeamId: string | null;
  lowTeamId: string | null;
  status: MatchupStatus;
  computedTally: unknown;
  computedWinnerTeamId: string | null;
  decidedBy: string | null;
  lockedAt: Date | null;
  settledAt: Date | null;
  overrideWinnerTeamId: string | null;
};

export type StatLineForProcessing = {
  teamId: string;
  week: number;
  stats: Record<string, unknown>;
};

export type TeamForMatchupProcessing = {
  id: string;
  finalSeed: number | null;
  regularSeasonOutcomeTotals: OutcomeTotalsLike;
};

export type LeagueSettingsForMatchupProcessing = {
  statCategories: readonly WeekStatCategory[];
  minInningsPitched: number | null;
};

export type ComputedMatchupTally = {
  teamAId: string;
  teamBId: string;
  teamAWins: number;
  teamBWins: number;
  tiedCategories: number;
  categoryWinner: WeekComparisonResult["winner"];
  computedWinnerTeamId: string;
  decidedBy: DecidedBy;
  categories: WeekComparisonResult["categories"];
};

export type ComputedMatchupResult = {
  computedTally: ComputedMatchupTally;
  computedWinnerTeamId: string;
  decidedBy: DecidedBy;
  resultFingerprint: string;
  comparison: WeekComparisonResult;
};

export type MatchupNoActionReason =
  | "before_week_close"
  | "final"
  | "missing_lock_time"
  | "missing_stat_lines"
  | "missing_teams"
  | "settle_window_open"
  | "under_review"
  | "upstream_under_review";

export type MatchupComputationDecision =
  | {
      action: "none";
      reason: MatchupNoActionReason;
      matchupId: string;
      wroteData: false;
      sideEffects: [];
    }
  | {
      action: "record_provisional";
      matchupId: string;
      expectedStatus: "pending" | "live";
      expectedHighTeamId: string;
      expectedLowTeamId: string;
      status: "provisional";
      lockedAt: Date;
      computed: ComputedMatchupResult;
      wroteData: true;
      sideEffects: StateMachineSideEffect[];
    }
  | {
      action: "update_provisional";
      matchupId: string;
      expectedStatus: "provisional";
      expectedHighTeamId: string;
      expectedLowTeamId: string;
      status: "provisional";
      computed: ComputedMatchupResult;
      wroteData: true;
      sideEffects: StateMachineSideEffect[];
    }
  | {
      action: "settle";
      matchupId: string;
      expectedStatus: "provisional";
      expectedHighTeamId: string;
      expectedLowTeamId: string;
      status: "final";
      settledAt: Date;
      computed: ComputedMatchupResult;
      wroteData: true;
      sideEffects: StateMachineSideEffect[];
    }
  | {
      action: "flag_review";
      matchupId: string;
      expectedStatus: "provisional";
      expectedHighTeamId: string;
      expectedLowTeamId: string;
      status: "under_review";
      corrected: ComputedMatchupResult;
      wroteData: true;
      sideEffects: StateMachineSideEffect[];
    };

export type RoundAdvancementTarget = {
  id: string;
  round: 2 | 3;
  week: number;
  highTeamId: string;
  lowTeamId: string;
};

export type AdvancementNoActionReason =
  | "already_advanced"
  | "missing_source_matchups"
  | "missing_target_matchups"
  | "missing_winners"
  | "source_under_review"
  | "target_locked";

export type RoundAdvancementDecision =
  | {
      action: "none";
      reason: AdvancementNoActionReason;
      sourceRound: 1 | 2;
      wroteData: false;
      sideEffects: [];
    }
  | {
      action: "advance_round";
      sourceRound: 1 | 2;
      targetRound: 2 | 3;
      targets: RoundAdvancementTarget[];
      wroteData: true;
      sideEffects: StateMachineSideEffect[];
    };

export type MatchupProcessingSnapshot = {
  matchups: readonly MatchupForProcessing[];
  statLines: readonly StatLineForProcessing[];
  teams: readonly TeamForMatchupProcessing[];
  regularSeasonMatchups: readonly RegularSeasonMatchupRow[];
  leagueSettings: LeagueSettingsForMatchupProcessing;
  now: Date;
  config?: MatchupProcessorConfig;
};

export type MatchupProcessingStep =
  | {
      type: "matchup";
      decision: Exclude<MatchupComputationDecision, { action: "none" }>;
    }
  | {
      type: "advancement";
      decision: Exclude<RoundAdvancementDecision, { action: "none" }>;
    }
  | {
      type: "none";
    };

function roundConfigForMatchup(
  matchup: Pick<MatchupForProcessing, "round" | "week">,
  config: MatchupProcessorConfig,
): BowlRound {
  const round = config.rounds.find(
    (candidate) =>
      candidate.round === matchup.round && candidate.week === matchup.week,
  );

  if (round === undefined) {
    throw new Error(
      `No configured Loser Bowl round matches round ${matchup.round}, week ${matchup.week}`,
    );
  }

  return round;
}

export function hasMatchupWeekClosed(
  matchup: Pick<MatchupForProcessing, "round" | "week">,
  now: Date,
  config: MatchupProcessorConfig = LEAGUE_CONFIG,
): boolean {
  const round = roundConfigForMatchup(matchup, config);

  return dateKeyInTimeZone(now, config.timeZone) > round.end;
}

function statLineKey(teamId: string, week: number): string {
  return `${teamId}:${week}`;
}

function statLinesByTeamWeek(
  statLines: readonly StatLineForProcessing[],
): Map<string, StatLineForProcessing> {
  return new Map(
    statLines.map((line) => [statLineKey(line.teamId, line.week), line]),
  );
}

function weekStatsFromJson(stats: Record<string, unknown>): WeekStats {
  const weekStats: WeekStats = {};

  for (const [slug, value] of Object.entries(stats)) {
    if (
      value === null ||
      value === undefined ||
      typeof value === "string" ||
      typeof value === "number"
    ) {
      weekStats[slug] = value;
      continue;
    }

    throw new Error(
      `Stat "${slug}" has unsupported value type "${typeof value}"`,
    );
  }

  return weekStats;
}

function tiebreakerContext(
  teams: readonly TeamForMatchupProcessing[],
  regularSeasonMatchups: readonly RegularSeasonMatchupRow[],
): TiebreakerContext {
  const outcomeTotalsByTeamId: TiebreakerContext["outcomeTotalsByTeamId"] = {};
  const seedsByTeamId: TiebreakerContext["seedsByTeamId"] = {};

  for (const team of teams) {
    outcomeTotalsByTeamId[team.id] = team.regularSeasonOutcomeTotals;
    seedsByTeamId[team.id] = team.finalSeed ?? undefined;
  }

  return {
    regularSeasonMatchups,
    outcomeTotalsByTeamId,
    seedsByTeamId,
  };
}

export function computeMatchupResult(input: {
  teamAId: string;
  teamBId: string;
  statsA: Record<string, unknown>;
  statsB: Record<string, unknown>;
  leagueSettings: LeagueSettingsForMatchupProcessing;
  tiebreakerContext: TiebreakerContext;
  mode: "live" | "final";
}): ComputedMatchupResult {
  const comparison = compareWeek(
    weekStatsFromJson(input.statsA),
    weekStatsFromJson(input.statsB),
    input.leagueSettings.statCategories,
    {
      minInningsPitched: input.leagueSettings.minInningsPitched,
      mode: input.mode,
    },
  );
  let computedWinnerTeamId: string;
  let decidedBy: DecidedBy;

  if (comparison.winner === "teamA") {
    computedWinnerTeamId = input.teamAId;
    decidedBy = "categories";
  } else if (comparison.winner === "teamB") {
    computedWinnerTeamId = input.teamBId;
    decidedBy = "categories";
  } else {
    const tiebreaker = applyTiebreakers(
      {
        teamAId: input.teamAId,
        teamBId: input.teamBId,
        teamAWins: comparison.teamAWins,
        teamBWins: comparison.teamBWins,
      },
      input.tiebreakerContext,
    );

    computedWinnerTeamId = tiebreaker.winnerTeamId;
    decidedBy = tiebreaker.decidedBy;
  }
  const computedTally: ComputedMatchupTally = {
    teamAId: input.teamAId,
    teamBId: input.teamBId,
    teamAWins: comparison.teamAWins,
    teamBWins: comparison.teamBWins,
    tiedCategories: comparison.tiedCategories,
    categoryWinner: comparison.winner,
    computedWinnerTeamId,
    decidedBy,
    categories: comparison.categories,
  };

  return {
    computedTally,
    computedWinnerTeamId,
    decidedBy,
    resultFingerprint: jsonFingerprint(computedTally),
    comparison,
  };
}

export function decideMatchupComputation(input: {
  matchup: MatchupForProcessing;
  statLines: readonly StatLineForProcessing[];
  teams: readonly TeamForMatchupProcessing[];
  regularSeasonMatchups: readonly RegularSeasonMatchupRow[];
  leagueSettings: LeagueSettingsForMatchupProcessing;
  now: Date;
  upstreamUnderReview?: boolean;
  config?: MatchupProcessorConfig;
}): MatchupComputationDecision {
  const config = input.config ?? LEAGUE_CONFIG;
  const matchup = input.matchup;

  if (matchup.status === "final") {
    return {
      action: "none",
      reason: "final",
      matchupId: matchup.id,
      wroteData: false,
      sideEffects: [],
    };
  }

  if (matchup.status === "under_review") {
    return {
      action: "none",
      reason: "under_review",
      matchupId: matchup.id,
      wroteData: false,
      sideEffects: [],
    };
  }

  if (input.upstreamUnderReview === true) {
    return {
      action: "none",
      reason: "upstream_under_review",
      matchupId: matchup.id,
      wroteData: false,
      sideEffects: [],
    };
  }

  if (matchup.highTeamId === null || matchup.lowTeamId === null) {
    return {
      action: "none",
      reason: "missing_teams",
      matchupId: matchup.id,
      wroteData: false,
      sideEffects: [],
    };
  }

  if (!hasMatchupWeekClosed(matchup, input.now, config)) {
    return {
      action: "none",
      reason: "before_week_close",
      matchupId: matchup.id,
      wroteData: false,
      sideEffects: [],
    };
  }

  const statLineMap = statLinesByTeamWeek(input.statLines);
  const statsA = statLineMap.get(
    statLineKey(matchup.highTeamId, matchup.week),
  )?.stats;
  const statsB = statLineMap.get(
    statLineKey(matchup.lowTeamId, matchup.week),
  )?.stats;

  if (statsA === undefined || statsB === undefined) {
    return {
      action: "none",
      reason: "missing_stat_lines",
      matchupId: matchup.id,
      wroteData: false,
      sideEffects: [],
    };
  }

  const computed = computeMatchupResult({
    teamAId: matchup.highTeamId,
    teamBId: matchup.lowTeamId,
    statsA,
    statsB,
    leagueSettings: input.leagueSettings,
    tiebreakerContext: tiebreakerContext(input.teams, input.regularSeasonMatchups),
    mode: "final",
  });

  if (matchup.status === "pending" || matchup.status === "live") {
    const transition = transitionMatchupState(
      { status: matchup.status },
      {
        type: "record_provisional_result",
        resultFingerprint: computed.resultFingerprint,
        winnerTeamId: computed.computedWinnerTeamId,
      },
      input.now,
    );

    return {
      action: "record_provisional",
      matchupId: matchup.id,
      expectedStatus: matchup.status,
      expectedHighTeamId: matchup.highTeamId,
      expectedLowTeamId: matchup.lowTeamId,
      status: "provisional",
      lockedAt: transition.nextState.lockedAt ?? input.now,
      computed,
      wroteData: true,
      sideEffects: transition.sideEffects,
    };
  }

  if (matchup.lockedAt === null) {
    return {
      action: "none",
      reason: "missing_lock_time",
      matchupId: matchup.id,
      wroteData: false,
      sideEffects: [],
    };
  }

  const transition = transitionMatchupState(
    {
      status: matchup.status,
      resultFingerprint: jsonFingerprint(matchup.computedTally),
      computedWinnerTeamId: matchup.computedWinnerTeamId,
      overrideWinnerTeamId: matchup.overrideWinnerTeamId,
      lockedAt: matchup.lockedAt,
      settledAt: matchup.settledAt ?? undefined,
      review: null,
    },
    {
      type: "settle_check",
      resultFingerprint: computed.resultFingerprint,
      winnerTeamId: computed.computedWinnerTeamId,
    },
    input.now,
  );

  if (transition.nextState.status === "under_review") {
    return {
      action: "flag_review",
      matchupId: matchup.id,
      expectedStatus: "provisional",
      expectedHighTeamId: matchup.highTeamId,
      expectedLowTeamId: matchup.lowTeamId,
      status: "under_review",
      corrected: computed,
      wroteData: true,
      sideEffects: transition.sideEffects,
    };
  }

  if (transition.nextState.status === "final") {
    return {
      action: "settle",
      matchupId: matchup.id,
      expectedStatus: "provisional",
      expectedHighTeamId: matchup.highTeamId,
      expectedLowTeamId: matchup.lowTeamId,
      status: "final",
      settledAt: transition.nextState.settledAt ?? input.now,
      computed,
      wroteData: true,
      sideEffects: transition.sideEffects,
    };
  }

  const shouldUpdate = transition.sideEffects.some(
    (effect) => effect.type === "update_result",
  );

  if (shouldUpdate) {
    return {
      action: "update_provisional",
      matchupId: matchup.id,
      expectedStatus: "provisional",
      expectedHighTeamId: matchup.highTeamId,
      expectedLowTeamId: matchup.lowTeamId,
      status: "provisional",
      computed,
      wroteData: true,
      sideEffects: transition.sideEffects,
    };
  }

  return {
    action: "none",
    reason: "settle_window_open",
    matchupId: matchup.id,
    wroteData: false,
    sideEffects: [],
  };
}

function matchupOrder(matchup: MatchupForProcessing): string {
  return `${matchup.round}:${matchup.id}`;
}

export function effectiveWinnerTeamId(
  matchup: Pick<
    MatchupForProcessing,
    "computedWinnerTeamId" | "overrideWinnerTeamId"
  >,
): string | null {
  return matchup.overrideWinnerTeamId ?? matchup.computedWinnerTeamId ?? null;
}

function sourceMatchupIds(sourceRound: 1 | 2): readonly string[] {
  return sourceRound === 1 ? ROUND_ONE_MATCHUP_IDS : ROUND_TWO_MATCHUP_IDS;
}

function targetMatchupIds(sourceRound: 1 | 2): readonly string[] {
  return sourceRound === 1 ? ROUND_TWO_MATCHUP_IDS : [FINAL_MATCHUP_ID];
}

function targetRound(sourceRound: 1 | 2): 2 | 3 {
  return sourceRound === 1 ? 2 : 3;
}

function targetWeek(sourceRound: 1 | 2, config: MatchupProcessorConfig): number {
  const round = config.rounds.find(
    (candidate) => candidate.round === targetRound(sourceRound),
  );

  if (round === undefined) {
    throw new Error(
      `No configured Loser Bowl target round for source round ${sourceRound}`,
    );
  }

  return round.week;
}

export function decideRoundAdvancement(input: {
  sourceRound: 1 | 2;
  matchups: readonly MatchupForProcessing[];
  teams: readonly TeamForMatchupProcessing[];
  config?: MatchupProcessorConfig;
}): RoundAdvancementDecision {
  const config = input.config ?? LEAGUE_CONFIG;
  const matchupsById = new Map(
    input.matchups.map((matchup) => [matchup.id, matchup]),
  );
  const sourceIds = sourceMatchupIds(input.sourceRound);
  const targetIds = targetMatchupIds(input.sourceRound);
  const sourceMatchups = sourceIds
    .map((id) => matchupsById.get(id))
    .filter((matchup): matchup is MatchupForProcessing => matchup !== undefined);

  if (sourceMatchups.length !== sourceIds.length) {
    return {
      action: "none",
      reason: "missing_source_matchups",
      sourceRound: input.sourceRound,
      wroteData: false,
      sideEffects: [],
    };
  }

  if (
    sourceMatchups.some((matchup) => matchup.status === "under_review") ||
    input.matchups.some(
      (matchup) =>
        matchup.round < input.sourceRound && matchup.status === "under_review",
    )
  ) {
    return {
      action: "none",
      reason: "source_under_review",
      sourceRound: input.sourceRound,
      wroteData: false,
      sideEffects: [],
    };
  }

  const winnerIds = sourceMatchups.map(effectiveWinnerTeamId);

  if (winnerIds.some((winnerId) => winnerId === null)) {
    return {
      action: "none",
      reason: "missing_winners",
      sourceRound: input.sourceRound,
      wroteData: false,
      sideEffects: [],
    };
  }

  const teamsById = new Map(input.teams.map((team) => [team.id, team]));
  const aliveTeams = winnerIds.map((winnerId) => {
    const team = teamsById.get(winnerId as string);

    if (team?.finalSeed === null || team?.finalSeed === undefined) {
      throw new Error(
        `Cannot advance team "${winnerId}" without an original bowl seed`,
      );
    }

    return {
      id: team.id,
      seed: team.finalSeed,
    };
  });
  const pairings = nextRoundPairings(aliveTeams);
  const targetRows = targetIds
    .map((id) => matchupsById.get(id))
    .filter((matchup): matchup is MatchupForProcessing => matchup !== undefined);

  if (targetRows.length !== targetIds.length) {
    return {
      action: "none",
      reason: "missing_target_matchups",
      sourceRound: input.sourceRound,
      wroteData: false,
      sideEffects: [],
    };
  }

  const targets = pairings.map((pairing, index): RoundAdvancementTarget => ({
    id: targetIds[index],
    round: targetRound(input.sourceRound),
    week: targetWeek(input.sourceRound, config),
    highTeamId: pairing.highTeam.id,
    lowTeamId: pairing.lowTeam.id,
  }));
  const lockedTarget = targets.some((target) => {
    const row = matchupsById.get(target.id);

    return (
      row !== undefined &&
      row.status !== "pending" &&
      row.status !== "live" &&
      (row.highTeamId !== target.highTeamId || row.lowTeamId !== target.lowTeamId)
    );
  });

  if (lockedTarget) {
    return {
      action: "none",
      reason: "target_locked",
      sourceRound: input.sourceRound,
      wroteData: false,
      sideEffects: [],
    };
  }

  const alreadyAdvanced = targets.every((target) => {
    const row = matchupsById.get(target.id);

    return row?.highTeamId === target.highTeamId && row.lowTeamId === target.lowTeamId;
  });

  if (alreadyAdvanced) {
    return {
      action: "none",
      reason: "already_advanced",
      sourceRound: input.sourceRound,
      wroteData: false,
      sideEffects: [],
    };
  }

  return {
    action: "advance_round",
    sourceRound: input.sourceRound,
    targetRound: targetRound(input.sourceRound),
    targets,
    wroteData: true,
    sideEffects: [],
  };
}

function hasUpstreamReview(
  matchup: MatchupForProcessing,
  matchups: readonly MatchupForProcessing[],
): boolean {
  if (matchup.round === 1) {
    return false;
  }

  return matchups.some(
    (candidate) =>
      candidate.round < matchup.round && candidate.status === "under_review",
  );
}

export function decideNextMatchupProcessingStep(
  snapshot: MatchupProcessingSnapshot,
): MatchupProcessingStep {
  for (const sourceRound of [1, 2] as const) {
    const decision = decideRoundAdvancement({
      sourceRound,
      matchups: snapshot.matchups,
      teams: snapshot.teams,
      config: snapshot.config,
    });

    if (decision.action !== "none") {
      return { type: "advancement", decision };
    }
  }

  const sortedMatchups = [...snapshot.matchups].sort((a, b) =>
    matchupOrder(a).localeCompare(matchupOrder(b)),
  );

  for (const matchup of sortedMatchups) {
    const decision = decideMatchupComputation({
      matchup,
      statLines: snapshot.statLines,
      teams: snapshot.teams,
      regularSeasonMatchups: snapshot.regularSeasonMatchups,
      leagueSettings: snapshot.leagueSettings,
      now: snapshot.now,
      upstreamUnderReview: hasUpstreamReview(matchup, snapshot.matchups),
      config: snapshot.config,
    });

    if (decision.action !== "none") {
      return { type: "matchup", decision };
    }
  }

  return { type: "none" };
}
