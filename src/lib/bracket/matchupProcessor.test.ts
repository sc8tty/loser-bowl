import { describe, expect, it } from "vitest";

import { SEEDED_STAT_CATEGORIES } from "@/config/categories.seed";
import { LEAGUE_CONFIG } from "@/config/league";
import { jsonFingerprint } from "@/lib/admin/state";

import { phase } from "./phase";
import {
  decideSeedLock,
  type SeedLockStanding,
} from "./seedLockProcessor";
import {
  computeMatchupResult,
  decideMatchupComputation,
  decideNextMatchupProcessingStep,
  decideRoundAdvancement,
  effectiveWinnerTeamId,
  type MatchupForProcessing,
  type MatchupProcessingStep,
  type StatLineForProcessing,
  type TeamForMatchupProcessing,
} from "./matchupProcessor";
import { transitionMatchupState } from "./stateMachine";
import { type TiebreakerContext } from "./tiebreakers";

type MemoryMatchup = MatchupForProcessing & {
  overrideNote: string | null;
  overriddenAt: Date | null;
};

const LOCK_BOUNDARY = new Date("2026-09-07T07:00:00.000Z");
const R1_CLOSE = new Date("2026-09-14T07:00:00.000Z");
const R1_CORRECTION = new Date("2026-09-14T12:00:00.000Z");
const R2_CLOSE = new Date("2026-09-21T07:00:00.000Z");
const R2_SETTLE = new Date("2026-09-22T07:00:00.000Z");
const FINAL_CLOSE = new Date("2026-09-28T07:00:00.000Z");
const FINAL_SETTLE = new Date("2026-09-29T07:00:00.000Z");

const scoringCategories = SEEDED_STAT_CATEGORIES.filter(
  (category) => !category.is_only_display_stat,
);
const leagueSettings = {
  statCategories: SEEDED_STAT_CATEGORIES,
  minInningsPitched: null,
};
const roundOneSeedPairs = [
  { id: "r1m1", highSeed: 9, lowSeed: 16 },
  { id: "r1m2", highSeed: 10, lowSeed: 15 },
  { id: "r1m3", highSeed: 11, lowSeed: 14 },
  { id: "r1m4", highSeed: 12, lowSeed: 13 },
] as const;

function seedTeamId(seed: number): string {
  return `team-${seed}`;
}

function matchupRow(
  overrides: Partial<MatchupForProcessing> = {},
): MatchupForProcessing {
  return {
    id: "r1m1",
    round: 1,
    week: LEAGUE_CONFIG.rounds[0].week,
    highTeamId: "team-a",
    lowTeamId: "team-b",
    status: "pending",
    computedTally: null,
    computedWinnerTeamId: null,
    decidedBy: null,
    lockedAt: null,
    settledAt: null,
    overrideWinnerTeamId: null,
    ...overrides,
  };
}

function matchupTeam(
  id: string,
  finalSeed: number | null,
  categoryWins?: number,
): TeamForMatchupProcessing {
  return {
    id,
    finalSeed,
    regularSeasonOutcomeTotals:
      categoryWins === undefined ? {} : { category_wins: categoryWins },
  };
}

function seededBracketTeams(): TeamForMatchupProcessing[] {
  return Array.from({ length: 8 }, (_, index) => {
    const seed = index + 9;

    return matchupTeam(seedTeamId(seed), seed, 100 - seed);
  });
}

function standings(): SeedLockStanding[] {
  return Array.from({ length: 16 }, (_, index) => ({
    id: `team-${index + 1}`,
    currentRank: index + 1,
  }));
}

function teams(): TeamForMatchupProcessing[] {
  return Array.from({ length: 16 }, (_, index) => ({
    id: `team-${index + 1}`,
    finalSeed: null,
    regularSeasonOutcomeTotals: {
      category_wins: 100 - index,
      category_losses: index,
      category_ties: 0,
    },
  }));
}

function statsForResult(
  teamAWins: number,
  teamBWins: number,
): [Record<string, unknown>, Record<string, unknown>] {
  const winners = [
    ...Array.from({ length: teamAWins }, () => "teamA" as const),
    ...Array.from({ length: teamBWins }, () => "teamB" as const),
    ...Array.from(
      { length: scoringCategories.length - teamAWins - teamBWins },
      () => "tie" as const,
    ),
  ];
  const statsA: Record<string, unknown> = {
    at_bats: "100",
    batting_hits: "30",
    earned_runs_allowed: "10",
    hits_allowed: "30",
    walks_allowed: "10",
    innings_pitched: "30.0",
  };
  const statsB: Record<string, unknown> = {
    at_bats: "100",
    batting_hits: "30",
    earned_runs_allowed: "10",
    hits_allowed: "30",
    walks_allowed: "10",
    innings_pitched: "30.0",
  };

  scoringCategories.forEach((category, index) => {
    const winner = winners[index];
    const teamAWinnerValue = category.sort_order === "asc" ? 1 : 10;
    const teamBWinnerValue = category.sort_order === "asc" ? 10 : 1;

    if (winner === "teamA") {
      statsA[category.slug] = teamAWinnerValue;
      statsB[category.slug] = teamBWinnerValue;
    } else if (winner === "teamB") {
      statsA[category.slug] = teamBWinnerValue;
      statsB[category.slug] = teamAWinnerValue;
    } else {
      statsA[category.slug] = 5;
      statsB[category.slug] = 5;
    }
  });

  return [statsA, statsB];
}

function setStatLines(
  statLines: Map<string, StatLineForProcessing>,
  week: number,
  teamAId: string,
  teamBId: string,
  teamAWins: number,
  teamBWins: number,
): void {
  const [statsA, statsB] = statsForResult(teamAWins, teamBWins);

  statLines.set(`${teamAId}:${week}`, {
    teamId: teamAId,
    week,
    stats: statsA,
  });
  statLines.set(`${teamBId}:${week}`, {
    teamId: teamBId,
    week,
    stats: statsB,
  });
}

function statLinesForResult(
  week: number,
  teamAId: string,
  teamBId: string,
  teamAWins: number,
  teamBWins: number,
): StatLineForProcessing[] {
  const [statsA, statsB] = statsForResult(teamAWins, teamBWins);

  return [
    { teamId: teamAId, week, stats: statsA },
    { teamId: teamBId, week, stats: statsB },
  ];
}

function tiebreakerContext(
  input: {
    teamAId?: string;
    teamBId?: string;
    regularSeasonWinners?: readonly (string | null)[];
    seasonCategoryWinsA?: number;
    seasonCategoryWinsB?: number;
    seedA?: number;
    seedB?: number;
  } = {},
): TiebreakerContext {
  const teamAId = input.teamAId ?? "team-a";
  const teamBId = input.teamBId ?? "team-b";
  const outcomeTotalsByTeamId: TiebreakerContext["outcomeTotalsByTeamId"] =
    {};
  const seedsByTeamId: TiebreakerContext["seedsByTeamId"] = {};

  if (input.seasonCategoryWinsA !== undefined) {
    outcomeTotalsByTeamId[teamAId] = {
      category_wins: input.seasonCategoryWinsA,
    };
  }

  if (input.seasonCategoryWinsB !== undefined) {
    outcomeTotalsByTeamId[teamBId] = {
      category_wins: input.seasonCategoryWinsB,
    };
  }

  if (input.seedA !== undefined) {
    seedsByTeamId[teamAId] = input.seedA;
  }

  if (input.seedB !== undefined) {
    seedsByTeamId[teamBId] = input.seedB;
  }

  return {
    regularSeasonMatchups: (input.regularSeasonWinners ?? []).map(
      (winnerTeamId) => ({
        teamAId,
        teamBId,
        winnerTeamId,
      }),
    ),
    outcomeTotalsByTeamId,
    seedsByTeamId,
  };
}

function roundOneMatchups(
  winnerSeeds: readonly [number, number, number, number],
  overrides: Partial<Record<string, Partial<MatchupForProcessing>>> = {},
): MatchupForProcessing[] {
  return roundOneSeedPairs.map((pairing, index) => {
    const winnerSeed = winnerSeeds[index];

    if (winnerSeed === undefined) {
      throw new Error(`Missing winner seed for ${pairing.id}`);
    }

    return matchupRow({
      id: pairing.id,
      round: 1,
      week: LEAGUE_CONFIG.rounds[0].week,
      highTeamId: seedTeamId(pairing.highSeed),
      lowTeamId: seedTeamId(pairing.lowSeed),
      status: "final",
      computedWinnerTeamId: seedTeamId(winnerSeed),
      ...overrides[pairing.id],
    });
  });
}

function roundTwoTargets(): MatchupForProcessing[] {
  return [
    matchupRow({
      id: "r2m1",
      round: 2,
      week: LEAGUE_CONFIG.rounds[1].week,
      highTeamId: null,
      lowTeamId: null,
    }),
    matchupRow({
      id: "r2m2",
      round: 2,
      week: LEAGUE_CONFIG.rounds[1].week,
      highTeamId: null,
      lowTeamId: null,
    }),
  ];
}

function roundOneAdvancementRows(
  winnerSeeds: readonly [number, number, number, number],
  overrides: Partial<Record<string, Partial<MatchupForProcessing>>> = {},
): MatchupForProcessing[] {
  return [...roundOneMatchups(winnerSeeds, overrides), ...roundTwoTargets()];
}

function expectRoundOneTargets(
  decision: ReturnType<typeof decideRoundAdvancement>,
  expected: readonly (readonly [string, string])[],
): void {
  expect(decision.action).toBe("advance_round");

  if (decision.action !== "advance_round") {
    throw new Error("Expected round advancement");
  }

  expect(
    decision.targets.map(({ id, highTeamId, lowTeamId }) => ({
      id,
      highTeamId,
      lowTeamId,
    })),
  ).toEqual(
    expected.map(([highTeamId, lowTeamId], index) => ({
      id: `r2m${index + 1}`,
      highTeamId,
      lowTeamId,
    })),
  );
}

function applyStep(
  step: Exclude<MatchupProcessingStep, { type: "none" }>,
  matchups: MemoryMatchup[],
): void {
  if (step.type === "advancement") {
    for (const target of step.decision.targets) {
      const matchup = matchups.find((row) => row.id === target.id);

      if (matchup === undefined) {
        throw new Error(`Missing target matchup ${target.id}`);
      }

      Object.assign(matchup, {
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
      });
    }

    return;
  }

  const matchup = matchups.find((row) => row.id === step.decision.matchupId);

  if (matchup === undefined) {
    throw new Error(`Missing matchup ${step.decision.matchupId}`);
  }

  if (step.decision.action === "record_provisional") {
    Object.assign(matchup, {
      status: "provisional",
      computedTally: step.decision.computed.computedTally,
      computedWinnerTeamId: step.decision.computed.computedWinnerTeamId,
      decidedBy: step.decision.computed.decidedBy,
      lockedAt: step.decision.lockedAt,
      settledAt: null,
      overrideWinnerTeamId: null,
      overrideNote: null,
      overriddenAt: null,
    });
  } else if (step.decision.action === "update_provisional") {
    Object.assign(matchup, {
      computedTally: step.decision.computed.computedTally,
      computedWinnerTeamId: step.decision.computed.computedWinnerTeamId,
      decidedBy: step.decision.computed.decidedBy,
    });
  } else if (step.decision.action === "settle") {
    Object.assign(matchup, {
      status: "final",
      computedTally: step.decision.computed.computedTally,
      computedWinnerTeamId: step.decision.computed.computedWinnerTeamId,
      decidedBy: step.decision.computed.decidedBy,
      settledAt: step.decision.settledAt,
    });
  } else {
    matchup.status = "under_review";
  }
}

function runProcessor(input: {
  now: Date;
  matchups: MemoryMatchup[];
  statLines: Map<string, StatLineForProcessing>;
  teams: TeamForMatchupProcessing[];
}): Exclude<MatchupProcessingStep, { type: "none" }>[] {
  const applied: Exclude<MatchupProcessingStep, { type: "none" }>[] = [];

  for (let index = 0; index < 32; index += 1) {
    const step = decideNextMatchupProcessingStep({
      now: input.now,
      matchups: input.matchups,
      statLines: [...input.statLines.values()],
      teams: input.teams,
      regularSeasonMatchups: [
        { teamAId: "team-11", teamBId: "team-14", winnerTeamId: "team-14" },
      ],
      leagueSettings: {
        statCategories: SEEDED_STAT_CATEGORIES,
        minInningsPitched: null,
      },
    });

    if (step.type === "none") {
      return applied;
    }

    applied.push(step);
    applyStep(step, input.matchups);
  }

  throw new Error("In-memory matchup processor did not quiesce");
}

function adminOverrideUnderReview(input: {
  matchups: MemoryMatchup[];
  matchupId: string;
  winnerTeamId: string;
  note: string;
  now: Date;
}): void {
  const matchup = input.matchups.find((row) => row.id === input.matchupId);

  if (matchup === undefined || matchup.status !== "under_review") {
    throw new Error("Expected an under-review matchup");
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
        correctedWinnerTeamId: input.winnerTeamId,
        originalResultFingerprint: fingerprint,
        correctedResultFingerprint: fingerprint,
        detectedAt: input.now,
      },
    },
    { type: "admin_override_corrected" },
    input.now,
  );

  Object.assign(matchup, {
    status: transition.nextState.status,
    computedWinnerTeamId: transition.nextState.computedWinnerTeamId ?? null,
    overrideWinnerTeamId: input.winnerTeamId,
    overrideNote: input.note,
    overriddenAt: input.now,
    settledAt: transition.nextState.settledAt ?? input.now,
  });
}

describe("computeMatchupResult", () => {
  it("decides a matchup outright by category wins without tiebreaker context", () => {
    const [statsA, statsB] = statsForResult(6, 4);
    const result = computeMatchupResult({
      teamAId: "team-a",
      teamBId: "team-b",
      statsA,
      statsB,
      leagueSettings,
      tiebreakerContext: tiebreakerContext(),
      mode: "final",
    });

    expect(result.computedWinnerTeamId).toBe("team-a");
    expect(result.decidedBy).toBe("categories");
    expect(result.computedTally).toMatchObject({
      teamAWins: 6,
      teamBWins: 4,
      categoryWinner: "teamA",
      computedWinnerTeamId: "team-a",
    });
  });

  it("resolves tied category wins by head-to-head series before later rungs", () => {
    const [statsA, statsB] = statsForResult(5, 5);
    const result = computeMatchupResult({
      teamAId: "team-a",
      teamBId: "team-b",
      statsA,
      statsB,
      leagueSettings,
      tiebreakerContext: tiebreakerContext({
        regularSeasonWinners: ["team-b"],
        seasonCategoryWinsA: 120,
        seasonCategoryWinsB: 80,
        seedA: 9,
        seedB: 16,
      }),
      mode: "final",
    });

    expect(result.computedWinnerTeamId).toBe("team-b");
    expect(result.decidedBy).toBe("h2h_series");
  });

  it("resolves tied category wins by season category wins when h2h is tied", () => {
    const [statsA, statsB] = statsForResult(5, 5);
    const result = computeMatchupResult({
      teamAId: "team-a",
      teamBId: "team-b",
      statsA,
      statsB,
      leagueSettings,
      tiebreakerContext: tiebreakerContext({
        regularSeasonWinners: ["team-a", "team-b"],
        seasonCategoryWinsA: 80,
        seasonCategoryWinsB: 120,
        seedA: 9,
        seedB: 16,
      }),
      mode: "final",
    });

    expect(result.computedWinnerTeamId).toBe("team-b");
    expect(result.decidedBy).toBe("season_cat_wins");
  });

  it("resolves tied category wins by seed when h2h and season category wins tie", () => {
    const [statsA, statsB] = statsForResult(5, 5);
    const result = computeMatchupResult({
      teamAId: "team-a",
      teamBId: "team-b",
      statsA,
      statsB,
      leagueSettings,
      tiebreakerContext: tiebreakerContext({
        regularSeasonWinners: ["team-a", "team-b"],
        seasonCategoryWinsA: 100,
        seasonCategoryWinsB: 100,
        seedA: 16,
        seedB: 9,
      }),
      mode: "final",
    });

    expect(result.computedWinnerTeamId).toBe("team-b");
    expect(result.decidedBy).toBe("seed");
  });

  it("lets live mode tolerate partial data that final mode rejects", () => {
    const partialLeagueSettings = {
      statCategories: [
        { slug: "hr", sort_order: "desc", is_only_display_stat: false },
        { slug: "r", sort_order: "desc", is_only_display_stat: false },
      ],
      minInningsPitched: null,
    } as const;
    const liveResult = computeMatchupResult({
      teamAId: "team-a",
      teamBId: "team-b",
      statsA: { hr: "4", r: "10" },
      statsB: { r: "5" },
      leagueSettings: partialLeagueSettings,
      tiebreakerContext: tiebreakerContext(),
      mode: "live",
    });

    expect(liveResult.decidedBy).toBe("categories");
    expect(liveResult.comparison).toMatchObject({
      teamAWins: 1,
      teamBWins: 0,
      tiedCategories: 1,
      winner: "teamA",
    });
    expect(() =>
      computeMatchupResult({
        teamAId: "team-a",
        teamBId: "team-b",
        statsA: { hr: "4", r: "10" },
        statsB: { r: "5" },
        leagueSettings: partialLeagueSettings,
        tiebreakerContext: tiebreakerContext(),
        mode: "final",
      }),
    ).toThrow(/Category "hr" is missing a final value/);
  });
});

describe("decideMatchupComputation", () => {
  it("surfaces tiebreaker context errors instead of swallowing them", () => {
    expect(() =>
      decideMatchupComputation({
        matchup: matchupRow(),
        statLines: statLinesForResult(
          LEAGUE_CONFIG.rounds[0].week,
          "team-a",
          "team-b",
          5,
          5,
        ),
        teams: [matchupTeam("team-a", 9), matchupTeam("team-b", 16)],
        regularSeasonMatchups: [],
        leagueSettings,
        now: R1_CLOSE,
      }),
    ).toThrow(/missing season category-win totals/);
  });
});

describe("effectiveWinnerTeamId", () => {
  it("prefers an override over a stale computed winner", () => {
    expect(
      effectiveWinnerTeamId({
        computedWinnerTeamId: "team-9",
        overrideWinnerTeamId: "team-16",
      }),
    ).toBe("team-16");
  });
});

describe("decideRoundAdvancement", () => {
  it("advances when every source matchup has a winner", () => {
    const decision = decideRoundAdvancement({
      sourceRound: 1,
      matchups: roundOneAdvancementRows([9, 10, 11, 12]),
      teams: seededBracketTeams(),
    });

    expectRoundOneTargets(decision, [
      ["team-9", "team-12"],
      ["team-10", "team-11"],
    ]);
  });

  it("does not advance while one source matchup is still pending", () => {
    const decision = decideRoundAdvancement({
      sourceRound: 1,
      matchups: roundOneAdvancementRows([9, 10, 11, 12], {
        r1m4: { status: "pending", computedWinnerTeamId: null },
      }),
      teams: seededBracketTeams(),
    });

    expect(decision).toMatchObject({
      action: "none",
      reason: "missing_winners",
      sourceRound: 1,
      wroteData: false,
    });
  });

  it("blocks advancement from an under-review source even when it has a stale computed winner", () => {
    const decision = decideRoundAdvancement({
      sourceRound: 1,
      matchups: roundOneAdvancementRows([9, 10, 11, 12], {
        r1m1: {
          status: "under_review",
          computedWinnerTeamId: "team-9",
        },
      }),
      teams: seededBracketTeams(),
    });

    expect(decision).toMatchObject({
      action: "none",
      reason: "source_under_review",
      sourceRound: 1,
      wroteData: false,
    });
  });

  it.each([
    {
      label: "top seeds",
      winners: [9, 10, 11, 12] as const,
      expected: [
        ["team-9", "team-12"],
        ["team-10", "team-11"],
      ] as const,
    },
    {
      label: "bottom seeds",
      winners: [16, 15, 14, 13] as const,
      expected: [
        ["team-13", "team-16"],
        ["team-14", "team-15"],
      ] as const,
    },
    {
      label: "mixed seeds",
      winners: [16, 10, 14, 12] as const,
      expected: [
        ["team-10", "team-16"],
        ["team-12", "team-14"],
      ] as const,
    },
  ])(
    "re-seeds $label round-one winners by highest-vs-lowest",
    ({ winners, expected }) => {
      const decision = decideRoundAdvancement({
        sourceRound: 1,
        matchups: roundOneAdvancementRows(winners),
        teams: seededBracketTeams(),
      });

      expectRoundOneTargets(decision, expected);
    },
  );

  it("uses an override winner when re-seeding downstream matchups", () => {
    const decision = decideRoundAdvancement({
      sourceRound: 1,
      matchups: roundOneAdvancementRows([9, 10, 11, 12], {
        r1m1: { overrideWinnerTeamId: "team-16" },
      }),
      teams: seededBracketTeams(),
    });

    expectRoundOneTargets(decision, [
      ["team-10", "team-16"],
      ["team-11", "team-12"],
    ]);
  });
});

describe("Loser Bowl dress rehearsal", () => {
  it("drives seed lock through a champion with a tiebreak, correction flip, and override", () => {
    const teamRows = teams();
    const seedDecision = decideSeedLock({
      standings: standings(),
      syncState: {
        seedLockStatus: "none",
        seedsLockedAt: null,
        seedsSettledAt: null,
        seedsSnapshot: null,
      },
      now: LOCK_BOUNDARY,
    });

    expect(seedDecision.action).toBe("lock_provisional");

    if (seedDecision.action !== "lock_provisional") {
      throw new Error("Expected seed lock");
    }

    for (const finalSeed of seedDecision.finalSeeds) {
      const team = teamRows.find((row) => row.id === finalSeed.teamId);

      if (team === undefined) {
        throw new Error(`Missing team ${finalSeed.teamId}`);
      }

      team.finalSeed = finalSeed.seed;
    }

    const matchups: MemoryMatchup[] = seedDecision.matchups.map((matchup) => ({
      ...matchup,
      computedTally: null,
      computedWinnerTeamId: null,
      decidedBy: null,
      lockedAt: null,
      settledAt: null,
      overrideWinnerTeamId: null,
      overrideNote: null,
      overriddenAt: null,
    }));
    const statLines = new Map<string, StatLineForProcessing>();

    setStatLines(statLines, 23, "team-9", "team-16", 6, 4);
    setStatLines(statLines, 23, "team-10", "team-15", 4, 6);
    setStatLines(statLines, 23, "team-11", "team-14", 5, 5);
    setStatLines(statLines, 23, "team-12", "team-13", 4, 6);

    const roundOneActions = runProcessor({
      now: R1_CLOSE,
      matchups,
      statLines,
      teams: teamRows,
    });

    expect(
      roundOneActions.filter(
        (step) =>
          step.type === "matchup" &&
          step.decision.action === "record_provisional",
      ),
    ).toHaveLength(4);
    expect(matchups.find((matchup) => matchup.id === "r1m3")).toMatchObject({
      computedWinnerTeamId: "team-14",
      decidedBy: "h2h_series",
    });
    expect(matchups.find((matchup) => matchup.id === "r2m1")).toMatchObject({
      highTeamId: "team-9",
      lowTeamId: "team-15",
    });
    expect(matchups.find((matchup) => matchup.id === "r2m2")).toMatchObject({
      highTeamId: "team-13",
      lowTeamId: "team-14",
    });

    setStatLines(statLines, 23, "team-9", "team-16", 4, 6);

    const correctionActions = runProcessor({
      now: R1_CORRECTION,
      matchups,
      statLines,
      teams: teamRows,
    });

    expect(
      correctionActions.some(
        (step) =>
          step.type === "matchup" &&
          step.decision.action === "flag_review" &&
          step.decision.matchupId === "r1m1",
      ),
    ).toBe(true);
    expect(matchups.find((matchup) => matchup.id === "r1m1")).toMatchObject({
      status: "under_review",
      computedWinnerTeamId: "team-9",
      overrideWinnerTeamId: null,
    });

    setStatLines(statLines, 24, "team-9", "team-15", 6, 4);
    setStatLines(statLines, 24, "team-13", "team-14", 6, 4);

    const frozenActions = runProcessor({
      now: R2_CLOSE,
      matchups,
      statLines,
      teams: teamRows,
    });

    expect(
      frozenActions.some(
        (step) =>
          step.type === "matchup" &&
          step.decision.matchupId.startsWith("r2"),
      ),
    ).toBe(false);
    expect(matchups.find((matchup) => matchup.id === "r2m1")).toMatchObject({
      status: "pending",
      computedWinnerTeamId: null,
    });

    adminOverrideUnderReview({
      matchups,
      matchupId: "r1m1",
      winnerTeamId: "team-16",
      note: "Corrected stat import flipped the matchup winner.",
      now: R2_CLOSE,
    });
    setStatLines(statLines, 24, "team-13", "team-16", 6, 4);
    setStatLines(statLines, 24, "team-14", "team-15", 6, 4);

    runProcessor({
      now: R2_CLOSE,
      matchups,
      statLines,
      teams: teamRows,
    });

    expect(matchups.find((matchup) => matchup.id === "r1m1")).toMatchObject({
      status: "final",
      overrideWinnerTeamId: "team-16",
      overrideNote: "Corrected stat import flipped the matchup winner.",
    });
    expect(matchups.find((matchup) => matchup.id === "r2m1")).toMatchObject({
      highTeamId: "team-13",
      lowTeamId: "team-16",
      status: "provisional",
      computedWinnerTeamId: "team-13",
    });
    expect(matchups.find((matchup) => matchup.id === "r2m2")).toMatchObject({
      highTeamId: "team-14",
      lowTeamId: "team-15",
      status: "provisional",
      computedWinnerTeamId: "team-14",
    });

    runProcessor({
      now: R2_SETTLE,
      matchups,
      statLines,
      teams: teamRows,
    });

    expect(matchups.find((matchup) => matchup.id === "final")).toMatchObject({
      highTeamId: "team-13",
      lowTeamId: "team-14",
      status: "pending",
    });

    setStatLines(statLines, 25, "team-13", "team-14", 4, 6);

    runProcessor({
      now: FINAL_CLOSE,
      matchups,
      statLines,
      teams: teamRows,
    });
    expect(matchups.find((matchup) => matchup.id === "final")).toMatchObject({
      status: "provisional",
      computedWinnerTeamId: "team-14",
    });

    runProcessor({
      now: FINAL_SETTLE,
      matchups,
      statLines,
      teams: teamRows,
    });

    const finalMatchup = matchups.find((matchup) => matchup.id === "final");

    expect(finalMatchup).toMatchObject({
      status: "final",
      computedWinnerTeamId: "team-14",
    });
    expect(
      phase(FINAL_SETTLE, LEAGUE_CONFIG, {
        status: finalMatchup?.status ?? "pending",
        computedWinnerTeamId: finalMatchup?.computedWinnerTeamId,
        overrideWinnerTeamId: finalMatchup?.overrideWinnerTeamId,
      }),
    ).toBe("champion");
  });
});
