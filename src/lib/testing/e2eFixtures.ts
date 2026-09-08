import "server-only";

import { SEEDED_STAT_CATEGORIES } from "@/config/categories.seed";
import { LEAGUE_CONFIG } from "@/config/league";
import { phase } from "@/lib/bracket/phase";
import {
  emptyPublicMatchup,
  matchupMeta,
  type PublicComparedCategory,
  type PublicComputedTally,
  type PublicMatchup,
  type PublicMatchupId,
  type PublicTeamRef,
} from "@/lib/public/matchups";
import type { LeagueData, LeagueTeam, MatchupDetailData } from "@/lib/sync/trigger";

export const E2E_SCENARIO_HEADER = "x-e2e-scenario";

type E2eScenario = "race" | "bracket" | "champion";
type ReadyLeagueData = Extract<LeagueData, { status: "ready" }>;
type FixtureSet = Record<E2eScenario, ReadyLeagueData>;

let fixtureCache: FixtureSet | null = null;

function isE2eTestModeActive(): boolean {
  if (process.env.E2E_TEST_MODE !== "true") {
    return false;
  }

  // Belt-and-suspenders: this makes it impossible for the fixture bypass to
  // silently serve fake data even if E2E_TEST_MODE were ever mistakenly set
  // in a real deployment's env vars, rather than relying solely on nobody
  // ever setting it there. NODE_ENV is NOT a usable signal here — `next
  // start` forces process.env.NODE_ENV to "production" at runtime
  // regardless of what's passed to it (confirmed: this broke the E2E suite
  // itself when tried), so this checks Vercel's own platform-set `VERCEL`
  // env var instead, which is only ever present on an actual Vercel
  // deployment, never under local/CI `next start`.
  if (process.env.VERCEL === "1") {
    throw new Error(
      "E2E_TEST_MODE=true is set on a real Vercel deployment — refusing to serve fixture data. Unset E2E_TEST_MODE.",
    );
  }

  return true;
}

function normalizeScenario(value: string | null | undefined): E2eScenario {
  const scenario = value?.split(",")[0]?.trim().toLowerCase();

  return scenario === "bracket" || scenario === "champion" ? scenario : "race";
}

function scoringCategorySlugs(): string[] {
  return SEEDED_STAT_CATEGORIES.filter(
    (category) => !category.is_only_display_stat,
  ).map((category) => category.slug);
}

function buildLeagueTeams(): LeagueTeam[] {
  return Array.from({ length: 16 }, (_, index) => {
    const rank = index + 1;
    const paddedRank = String(rank).padStart(2, "0");

    return {
      id: `e2e-team-${paddedRank}`,
      name: `E2E Team ${paddedRank}`,
      currentRank: rank,
      wins: 88 - rank * 2,
      losses: 54 + rank * 2,
      ties: rank % 4 === 0 ? 2 : 1,
    };
  });
}

function buildTeamsBySeed(teams: readonly LeagueTeam[]): Map<number, PublicTeamRef> {
  return new Map(
    teams.map((team) => [
      team.currentRank,
      {
        id: team.id,
        name: team.name,
        currentRank: team.currentRank,
        finalSeed:
          team.currentRank >= 9 && team.currentRank <= 16
            ? team.currentRank
            : null,
      },
    ]),
  );
}

function categoryValues(
  slug: string,
  index: number,
  winner: "teamA" | "teamB" | "tie",
): Pick<PublicComparedCategory, "teamAValue" | "teamBValue"> {
  if (winner === "tie") {
    if (slug === "avg") {
      return { teamAValue: 0.255, teamBValue: 0.255 };
    }

    if (slug === "era") {
      return { teamAValue: 3.75, teamBValue: 3.75 };
    }

    if (slug === "whip") {
      return { teamAValue: 1.22, teamBValue: 1.22 };
    }

    return { teamAValue: 20 + index, teamBValue: 20 + index };
  }

  const teamAWins = winner === "teamA";

  if (slug === "avg") {
    return {
      teamAValue: teamAWins ? 0.286 : 0.239,
      teamBValue: teamAWins ? 0.239 : 0.286,
    };
  }

  if (slug === "era") {
    return {
      teamAValue: teamAWins ? 2.72 : 4.86,
      teamBValue: teamAWins ? 4.86 : 2.72,
    };
  }

  if (slug === "whip") {
    return {
      teamAValue: teamAWins ? 1.08 : 1.39,
      teamBValue: teamAWins ? 1.39 : 1.08,
    };
  }

  const base = 16 + index * 3;

  return {
    teamAValue: teamAWins ? base + 9 : base,
    teamBValue: teamAWins ? base : base + 9,
  };
}

function buildComputedTally({
  teamA,
  teamB,
  teamAWins,
  teamBWins,
  tiedCategories = 0,
  winnerSide,
  decidedBy = "categories",
}: {
  teamA: PublicTeamRef;
  teamB: PublicTeamRef;
  teamAWins: number;
  teamBWins: number;
  tiedCategories?: number;
  winnerSide: "teamA" | "teamB";
  decidedBy?: PublicComputedTally["decidedBy"];
}): PublicComputedTally {
  const slugs = scoringCategorySlugs();
  const winners = [
    ...Array<"teamA">(teamAWins).fill("teamA"),
    ...Array<"teamB">(teamBWins).fill("teamB"),
    ...Array<"tie">(tiedCategories).fill("tie"),
  ];

  if (winners.length !== slugs.length) {
    throw new Error("E2E matchup tally must cover every seeded category.");
  }

  return {
    teamAId: teamA.id,
    teamBId: teamB.id,
    teamAWins,
    teamBWins,
    tiedCategories,
    categoryWinner:
      teamAWins === teamBWins ? "tie" : teamAWins > teamBWins ? "teamA" : "teamB",
    computedWinnerTeamId: winnerSide === "teamA" ? teamA.id : teamB.id,
    decidedBy,
    categories: slugs.map((slug, index) => ({
      slug,
      winner: winners[index],
      ...categoryValues(slug, index, winners[index]),
      ...(slug === "era" && winners[index] !== "tie"
        ? { decidedByPolicy: "innings_minimum" }
        : {}),
    })),
  };
}

type MatchupSpec = {
  id: PublicMatchupId;
  status: PublicMatchup["status"];
  highSeed: number | null;
  lowSeed: number | null;
  tally?: {
    highWins: number;
    lowWins: number;
    ties?: number;
    winner: "high" | "low";
    decidedBy?: PublicComputedTally["decidedBy"];
  };
  lockedAt?: string;
  settledAt?: string;
  overrideWinnerSeed?: number;
  overrideNote?: string;
  overriddenAt?: string;
};

function buildMatchup(
  spec: MatchupSpec,
  teamForSeed: (seed: number) => PublicTeamRef,
): PublicMatchup {
  const meta = matchupMeta(spec.id);
  const highTeam = spec.highSeed === null ? null : teamForSeed(spec.highSeed);
  const lowTeam = spec.lowSeed === null ? null : teamForSeed(spec.lowSeed);
  const computedTally =
    spec.tally === undefined || highTeam === null || lowTeam === null
      ? null
      : buildComputedTally({
          teamA: highTeam,
          teamB: lowTeam,
          teamAWins: spec.tally.highWins,
          teamBWins: spec.tally.lowWins,
          tiedCategories: spec.tally.ties,
          winnerSide: spec.tally.winner === "high" ? "teamA" : "teamB",
          decidedBy: spec.tally.decidedBy,
        });
  const computedWinner =
    computedTally === null
      ? null
      : computedTally.computedWinnerTeamId === highTeam?.id
        ? highTeam
        : lowTeam;

  return {
    id: spec.id,
    round: meta.round,
    week: meta.week,
    status: spec.status,
    highTeam,
    lowTeam,
    computedWinner,
    overrideWinner:
      spec.overrideWinnerSeed === undefined
        ? null
        : teamForSeed(spec.overrideWinnerSeed),
    computedTally,
    decidedBy: computedTally?.decidedBy ?? null,
    lockedAt: spec.lockedAt === undefined ? null : new Date(spec.lockedAt),
    settledAt: spec.settledAt === undefined ? null : new Date(spec.settledAt),
    overrideNote: spec.overrideNote ?? null,
    overriddenAt:
      spec.overriddenAt === undefined ? null : new Date(spec.overriddenAt),
  };
}

function finalMatchupForPhase(matchups: readonly PublicMatchup[]) {
  const finalMatchup = matchups.find((matchup) => matchup.id === "final");

  return finalMatchup === undefined
    ? null
    : {
        status: finalMatchup.status,
        computedWinnerTeamId: finalMatchup.computedWinner?.id ?? null,
        overrideWinnerTeamId: finalMatchup.overrideWinner?.id ?? null,
      };
}

function phaseNow(scenario: E2eScenario): Date {
  if (scenario === "race") {
    return new Date("2026-08-15T19:00:00.000Z");
  }

  if (scenario === "bracket") {
    return new Date("2026-09-14T19:00:00.000Z");
  }

  return new Date("2026-09-28T19:00:00.000Z");
}

function lastSuccessAt(scenario: E2eScenario): Date {
  if (scenario === "race") {
    return new Date("2026-08-15T18:30:00.000Z");
  }

  if (scenario === "bracket") {
    return new Date("2026-09-15T18:30:00.000Z");
  }

  return new Date("2026-09-28T18:30:00.000Z");
}

function buildLeagueData(
  scenario: E2eScenario,
  teams: LeagueTeam[],
  matchups: PublicMatchup[],
): ReadyLeagueData {
  return {
    status: "ready",
    teams,
    matchups,
    phase: phase(
      phaseNow(scenario),
      {
        timeZone: LEAGUE_CONFIG.timeZone,
        bracketLockDate: LEAGUE_CONFIG.bracketLockDate,
      },
      finalMatchupForPhase(matchups),
    ),
    lastSuccessAt: lastSuccessAt(scenario),
    lastUpdatedAt: lastSuccessAt(scenario),
  };
}

function buildFixtureSet(): FixtureSet {
  const teams = buildLeagueTeams();
  const teamsBySeed = buildTeamsBySeed(teams);
  const teamForSeed = (seed: number): PublicTeamRef => {
    const team = teamsBySeed.get(seed);

    if (team === undefined) {
      throw new Error(`No E2E fixture team exists for seed ${seed}.`);
    }

    return team;
  };
  const matchup = (spec: MatchupSpec) => buildMatchup(spec, teamForSeed);
  const bracketMatchups = [
    matchup({
      id: "r1m1",
      status: "final",
      highSeed: 9,
      lowSeed: 16,
      tally: { highWins: 6, lowWins: 9, winner: "low" },
      lockedAt: "2026-09-14T03:00:00.000Z",
      settledAt: "2026-09-16T03:00:00.000Z",
    }),
    matchup({
      id: "r1m2",
      status: "final",
      highSeed: 10,
      lowSeed: 15,
      tally: { highWins: 8, lowWins: 6, ties: 1, winner: "high" },
      lockedAt: "2026-09-14T03:00:00.000Z",
      settledAt: "2026-09-16T03:00:00.000Z",
    }),
    matchup({
      id: "r1m3",
      status: "provisional",
      highSeed: 11,
      lowSeed: 14,
      tally: { highWins: 6, lowWins: 8, ties: 1, winner: "low" },
      lockedAt: "2026-09-14T03:00:00.000Z",
    }),
    matchup({
      id: "r1m4",
      status: "live",
      highSeed: 12,
      lowSeed: 13,
      tally: {
        highWins: 7,
        lowWins: 7,
        ties: 1,
        winner: "low",
        decidedBy: "season_cat_wins",
      },
    }),
    matchup({
      id: "r2m1",
      status: "under_review",
      highSeed: 16,
      lowSeed: 10,
      tally: { highWins: 9, lowWins: 6, winner: "high" },
      lockedAt: "2026-09-21T03:00:00.000Z",
    }),
    matchup({
      id: "r2m2",
      status: "pending",
      highSeed: null,
      lowSeed: null,
    }),
    matchup({
      id: "final",
      status: "pending",
      highSeed: null,
      lowSeed: null,
    }),
  ];
  const championMatchups = [
    matchup({
      id: "r1m1",
      status: "final",
      highSeed: 9,
      lowSeed: 16,
      tally: { highWins: 6, lowWins: 9, winner: "low" },
      lockedAt: "2026-09-14T03:00:00.000Z",
      settledAt: "2026-09-16T03:00:00.000Z",
    }),
    matchup({
      id: "r1m2",
      status: "final",
      highSeed: 10,
      lowSeed: 15,
      tally: { highWins: 8, lowWins: 6, ties: 1, winner: "high" },
      lockedAt: "2026-09-14T03:00:00.000Z",
      settledAt: "2026-09-16T03:00:00.000Z",
    }),
    matchup({
      id: "r1m3",
      status: "final",
      highSeed: 11,
      lowSeed: 14,
      tally: { highWins: 6, lowWins: 8, ties: 1, winner: "low" },
      lockedAt: "2026-09-14T03:00:00.000Z",
      settledAt: "2026-09-16T03:00:00.000Z",
    }),
    matchup({
      id: "r1m4",
      status: "final",
      highSeed: 12,
      lowSeed: 13,
      tally: {
        highWins: 7,
        lowWins: 7,
        ties: 1,
        winner: "low",
        decidedBy: "season_cat_wins",
      },
      lockedAt: "2026-09-14T03:00:00.000Z",
      settledAt: "2026-09-16T03:00:00.000Z",
    }),
    matchup({
      id: "r2m1",
      status: "final",
      highSeed: 16,
      lowSeed: 10,
      tally: { highWins: 9, lowWins: 6, winner: "high" },
      lockedAt: "2026-09-21T03:00:00.000Z",
      settledAt: "2026-09-23T03:00:00.000Z",
    }),
    matchup({
      id: "r2m2",
      status: "final",
      highSeed: 14,
      lowSeed: 13,
      tally: { highWins: 9, lowWins: 6, winner: "high" },
      lockedAt: "2026-09-21T03:00:00.000Z",
      settledAt: "2026-09-23T03:00:00.000Z",
      overrideWinnerSeed: 13,
      overrideNote: "E2E smoke fixture commissioner override.",
      overriddenAt: "2026-09-23T18:00:00.000Z",
    }),
    matchup({
      id: "final",
      status: "final",
      highSeed: 16,
      lowSeed: 13,
      tally: { highWins: 9, lowWins: 6, winner: "high" },
      lockedAt: "2026-09-28T03:00:00.000Z",
      settledAt: "2026-09-29T03:00:00.000Z",
    }),
  ];

  return {
    race: buildLeagueData("race", teams, []),
    bracket: buildLeagueData("bracket", teams, bracketMatchups),
    champion: buildLeagueData("champion", teams, championMatchups),
  };
}

function getFixtureSet(): FixtureSet {
  fixtureCache ??= buildFixtureSet();

  return fixtureCache;
}

export function getE2eLeagueData(
  scenarioHeader: string | null | undefined,
): ReadyLeagueData | null {
  if (!isE2eTestModeActive()) {
    return null;
  }

  return getFixtureSet()[normalizeScenario(scenarioHeader)];
}

export function getE2eMatchupDetailData(
  matchupId: PublicMatchupId,
  scenarioHeader: string | null | undefined,
): MatchupDetailData | null {
  if (!isE2eTestModeActive()) {
    return null;
  }

  const data = getFixtureSet()[normalizeScenario(scenarioHeader)];
  const matchup =
    data.matchups.find((candidate) => candidate.id === matchupId) ?? null;

  if (matchup === null) {
    return {
      status: "not_created",
      matchupId,
      matchup: emptyPublicMatchup(matchupId),
      phase: data.phase,
      lastSuccessAt: data.lastSuccessAt,
      matchups: data.matchups,
      statCategories: SEEDED_STAT_CATEGORIES,
    };
  }

  return {
    status: "ready",
    matchupId,
    matchup,
    phase: data.phase,
    lastSuccessAt: data.lastSuccessAt,
    matchups: data.matchups,
    statCategories: SEEDED_STAT_CATEGORIES,
  };
}
