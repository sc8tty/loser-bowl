// Explicit .ts extensions on purpose: scripts/import-stats.ts loads this module
// under plain `node --experimental-strip-types`, which has no bundler-style
// extensionless resolution (comparator.ts carries the same note). tsconfig's
// allowImportingTsExtensions makes this legal for Next/vitest too.
import { LEAGUE_CONFIG, type BowlRound } from "../../config/league.ts";
import {
  compareWeek,
  type InningsMinimumPolicy,
  type WeekComparisonResult,
  type WeekStatCategory,
  type WeekStats,
} from "./comparator.ts";
import { dateKeyInTimeZone } from "./phase.ts";

export type LiveTallyConfig = {
  timeZone: string;
  rounds: readonly BowlRound[];
};

export type LiveTallyMatchup = {
  round: 1 | 2 | 3;
  week: number;
  status: string;
  highTeamId: string | null;
  lowTeamId: string | null;
};

export type LiveTallyStatLine = {
  teamId: string;
  week: number;
  stats: Record<string, unknown>;
  syncedAt?: Date | null;
};

export type LiveTallyLeagueSettings = {
  statCategories: readonly WeekStatCategory[];
};

/**
 * A mid-week, display-only category comparison. Unlike ComputedMatchupTally
 * it decides nothing: no tiebreakers, no winner, no state-machine transition.
 * `leaderTeamId` is null on a category tie — "tied" is the honest live answer.
 */
export type LiveTally = {
  teamAId: string;
  teamBId: string;
  teamAWins: number;
  teamBWins: number;
  tiedCategories: number;
  categoryWinner: WeekComparisonResult["winner"];
  leaderTeamId: string | null;
  categories: WeekComparisonResult["categories"];
  /** Most recent synced_at across the two stat lines, when known. */
  asOf: Date | null;
};

/**
 * Live view deliberately skips the innings-pitched minimum. The 24-IP
 * requirement is a week-close rule: on day one every team is "below minimum"
 * and the policy would flag ERA/WHIP as forced ties in every matchup all
 * week. Yahoo's own live matchup page compares the current ratios as-is and
 * only enforces the minimum when the week closes — the final-mode engine in
 * matchupProcessor.ts does exactly that, untouched by this module.
 */
const liveInningsMinimumPolicy: InningsMinimumPolicy = () => ({
  applies: false,
});

function toWeekStats(stats: Record<string, unknown>): WeekStats {
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

    throw new Error(`Stat "${slug}" has unsupported value type "${typeof value}"`);
  }

  return weekStats;
}

function roundFor(
  matchup: Pick<LiveTallyMatchup, "round" | "week">,
  config: LiveTallyConfig,
): BowlRound | null {
  return (
    config.rounds.find(
      (candidate) =>
        candidate.round === matchup.round && candidate.week === matchup.week,
    ) ?? null
  );
}

/**
 * A matchup gets a live tally only while the engine has not yet decided it:
 * status pending/live, both teams assigned, and its bowl week has begun in
 * league time. It stays eligible after the week ends until the engine records
 * the provisional result — the "live" label makes that window honest.
 */
export function isLiveTallyEligible(
  matchup: LiveTallyMatchup,
  now: Date,
  config: LiveTallyConfig = LEAGUE_CONFIG,
): boolean {
  if (matchup.status !== "pending" && matchup.status !== "live") {
    return false;
  }

  if (matchup.highTeamId === null || matchup.lowTeamId === null) {
    return false;
  }

  const round = roundFor(matchup, config);

  if (round === null) {
    return false;
  }

  return dateKeyInTimeZone(now, config.timeZone) >= round.start;
}

function latestDate(a: Date | null | undefined, b: Date | null | undefined): Date | null {
  if (!a) return b ?? null;
  if (!b) return a;

  return a.getTime() >= b.getTime() ? a : b;
}

export function computeLiveTally(input: {
  matchup: LiveTallyMatchup;
  statLines: readonly LiveTallyStatLine[];
  leagueSettings: LiveTallyLeagueSettings;
  now: Date;
  config?: LiveTallyConfig;
}): LiveTally | null {
  const config = input.config ?? LEAGUE_CONFIG;
  const { matchup } = input;

  if (!isLiveTallyEligible(matchup, input.now, config)) {
    return null;
  }

  const teamAId = matchup.highTeamId as string;
  const teamBId = matchup.lowTeamId as string;
  const lineA = input.statLines.find(
    (line) => line.teamId === teamAId && line.week === matchup.week,
  );
  const lineB = input.statLines.find(
    (line) => line.teamId === teamBId && line.week === matchup.week,
  );

  if (lineA === undefined || lineB === undefined) {
    return null;
  }

  const comparison = compareWeek(
    toWeekStats(lineA.stats),
    toWeekStats(lineB.stats),
    input.leagueSettings.statCategories,
    {
      mode: "live",
      inningsMinimumPolicy: liveInningsMinimumPolicy,
    },
  );

  return {
    teamAId,
    teamBId,
    teamAWins: comparison.teamAWins,
    teamBWins: comparison.teamBWins,
    tiedCategories: comparison.tiedCategories,
    categoryWinner: comparison.winner,
    leaderTeamId:
      comparison.winner === "teamA"
        ? teamAId
        : comparison.winner === "teamB"
          ? teamBId
          : null,
    categories: comparison.categories,
    asOf: latestDate(lineA.syncedAt, lineB.syncedAt),
  };
}
