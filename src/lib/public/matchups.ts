import { LEAGUE_CONFIG } from "@/config/league";
import type { StatCategory } from "@/config/categories.seed";
import {
  FINAL_MATCHUP_ID,
  ROUND_ONE_MATCHUP_IDS,
  ROUND_TWO_MATCHUP_IDS,
} from "@/lib/bracket/matchupProcessor";
import type { MatchupStatus } from "@/lib/bracket/stateMachine";
import type { DecidedBy } from "@/lib/bracket/tiebreakers";

export const PUBLIC_MATCHUP_IDS = [
  ...ROUND_ONE_MATCHUP_IDS,
  ...ROUND_TWO_MATCHUP_IDS,
  FINAL_MATCHUP_ID,
] as const;

export type PublicMatchupId = (typeof PUBLIC_MATCHUP_IDS)[number];

export type PublicTeamRef = {
  id: string;
  name: string;
  currentRank: number;
  finalSeed: number | null;
};

export type PublicComparedCategory = {
  slug: string;
  winner: "teamA" | "teamB" | "tie";
  teamAValue: number | null;
  teamBValue: number | null;
  decidedByPolicy?: string;
};

export type PublicComputedTally = {
  teamAId: string;
  teamBId: string;
  teamAWins: number;
  teamBWins: number;
  tiedCategories: number;
  categoryWinner: "teamA" | "teamB" | "tie";
  computedWinnerTeamId: string;
  decidedBy: DecidedBy;
  categories: PublicComparedCategory[];
};

/**
 * Display-only mid-week comparison built at read time from imported stat
 * lines (src/lib/bracket/liveTally.ts). It decides nothing: no tiebreakers,
 * no winner, no state transition — `leaderTeamId` is null on a category tie.
 */
export type PublicLiveTally = {
  teamAId: string;
  teamBId: string;
  teamAWins: number;
  teamBWins: number;
  tiedCategories: number;
  categoryWinner: "teamA" | "teamB" | "tie";
  leaderTeamId: string | null;
  categories: PublicComparedCategory[];
  /** Newest synced_at across the two stat lines, when known. */
  asOf: Date | null;
};

/** The shared shape every tally renderer reads — engine-computed or live. */
export type PublicTallyLike = Pick<
  PublicComputedTally,
  "teamAId" | "teamBId" | "teamAWins" | "teamBWins" | "tiedCategories" | "categories"
>;

export type PublicMatchup = {
  id: PublicMatchupId;
  round: 1 | 2 | 3;
  week: number;
  status: MatchupStatus;
  highTeam: PublicTeamRef | null;
  lowTeam: PublicTeamRef | null;
  computedWinner: PublicTeamRef | null;
  overrideWinner: PublicTeamRef | null;
  computedTally: PublicComputedTally | null;
  // Never populated alongside computedTally: once the engine records a result
  // the matchup leaves pending/live and the live view stops.
  liveTally: PublicLiveTally | null;
  decidedBy: DecidedBy | null;
  lockedAt: Date | null;
  settledAt: Date | null;
  overrideNote: string | null;
  overriddenAt: Date | null;
};

export type PublicMatchupSlot = PublicMatchup & {
  exists: boolean;
  upstreamUnderReview: boolean;
};

export type PublicStatCategory = Pick<
  StatCategory,
  "slug" | "display_name" | "is_only_display_stat"
>;

export type CategoryStatLine = {
  slug: string;
  label: string;
  highValue: string;
  lowValue: string;
  winner: "high" | "low" | "tie";
  policyLabel: string | null;
};

const matchupIdSet = new Set<string>(PUBLIC_MATCHUP_IDS);

function roundWeek(round: 1 | 2 | 3): number {
  const config = LEAGUE_CONFIG.rounds.find((candidate) => candidate.round === round);

  if (config === undefined) {
    throw new Error(`No configured Loser Bowl week for round ${round}`);
  }

  return config.week;
}

export function isPublicMatchupId(id: string): id is PublicMatchupId {
  return matchupIdSet.has(id);
}

export function toPublicMatchupId(id: string): PublicMatchupId | null {
  return isPublicMatchupId(id) ? id : null;
}

export function matchupMeta(id: PublicMatchupId): {
  round: 1 | 2 | 3;
  week: number;
  label: string;
} {
  if ((ROUND_ONE_MATCHUP_IDS as readonly string[]).includes(id)) {
    const index = ROUND_ONE_MATCHUP_IDS.indexOf(
      id as (typeof ROUND_ONE_MATCHUP_IDS)[number],
    );

    return {
      round: 1,
      week: roundWeek(1),
      label: `Round 1 Matchup ${index + 1}`,
    };
  }

  if ((ROUND_TWO_MATCHUP_IDS as readonly string[]).includes(id)) {
    const index = ROUND_TWO_MATCHUP_IDS.indexOf(
      id as (typeof ROUND_TWO_MATCHUP_IDS)[number],
    );

    return {
      round: 2,
      week: roundWeek(2),
      label: `Semifinal ${index + 1}`,
    };
  }

  return {
    round: 3,
    week: roundWeek(3),
    label: "Final",
  };
}

export function roundLabel(round: 1 | 2 | 3): string {
  if (round === 1) {
    return "Round 1";
  }

  if (round === 2) {
    return "Semifinals";
  }

  return "Final";
}

export function emptyPublicMatchup(id: PublicMatchupId): PublicMatchup {
  const meta = matchupMeta(id);

  return {
    id,
    round: meta.round,
    week: meta.week,
    status: "pending",
    highTeam: null,
    lowTeam: null,
    computedWinner: null,
    overrideWinner: null,
    computedTally: null,
    liveTally: null,
    decidedBy: null,
    lockedAt: null,
    settledAt: null,
    overrideNote: null,
    overriddenAt: null,
  };
}

export function hasUpstreamReview(
  matchup: Pick<PublicMatchup, "round">,
  matchups: readonly PublicMatchup[],
): boolean {
  if (matchup.round === 1) {
    return false;
  }

  return matchups.some(
    (candidate) =>
      candidate.status === "under_review" && candidate.round < matchup.round,
  );
}

export function buildBracketSlots(
  matchups: readonly PublicMatchup[],
): PublicMatchupSlot[] {
  const matchupsById = new Map(matchups.map((matchup) => [matchup.id, matchup]));

  return PUBLIC_MATCHUP_IDS.map((id) => {
    const matchup = matchupsById.get(id) ?? emptyPublicMatchup(id);

    return {
      ...matchup,
      exists: matchupsById.has(id),
      upstreamUnderReview: hasUpstreamReview(matchup, matchups),
    };
  });
}

export function effectiveWinner(
  matchup: Pick<PublicMatchup, "computedWinner" | "overrideWinner">,
): PublicTeamRef | null {
  return matchup.overrideWinner ?? matchup.computedWinner;
}

/** Engine result wins over the live view whenever both could exist. */
export function displayTally(
  matchup: Pick<PublicMatchup, "computedTally" | "liveTally">,
): { tally: PublicTallyLike; kind: "computed" | "live" } | null {
  if (matchup.computedTally !== null) {
    return { tally: matchup.computedTally, kind: "computed" };
  }

  if (matchup.liveTally !== null) {
    return { tally: matchup.liveTally, kind: "live" };
  }

  return null;
}

/**
 * "Live" is either the engine's own live status or a pending matchup whose
 * week is under way with imported stats to compare (manual mode).
 */
export function isLiveMatchup(
  matchup: Pick<PublicMatchup, "status"> &
    Partial<Pick<PublicMatchup, "computedTally" | "liveTally">>,
): boolean {
  if (matchup.status === "live") {
    return true;
  }

  return (
    matchup.status === "pending" &&
    (matchup.computedTally ?? null) === null &&
    (matchup.liveTally ?? null) !== null
  );
}

export function liveLeader(
  matchup: Pick<PublicMatchup, "liveTally" | "highTeam" | "lowTeam">,
): PublicTeamRef | null {
  const leaderId = matchup.liveTally?.leaderTeamId ?? null;

  if (leaderId === null) {
    return null;
  }

  if (matchup.highTeam?.id === leaderId) {
    return matchup.highTeam;
  }

  if (matchup.lowTeam?.id === leaderId) {
    return matchup.lowTeam;
  }

  return null;
}

export function formatDecidedBy(decidedBy: DecidedBy | string | null): string | null {
  if (decidedBy === null) {
    return null;
  }

  if (decidedBy === "categories") {
    return "categories";
  }

  if (decidedBy === "h2h_series") {
    return "head-to-head tiebreaker";
  }

  if (decidedBy === "season_cat_wins") {
    return "season category wins";
  }

  if (decidedBy === "seed") {
    return "higher seed";
  }

  return null;
}

export function toDecidedBy(value: string | null): DecidedBy | null {
  return formatDecidedBy(value) === null ? null : (value as DecidedBy);
}

function numberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];

  return typeof value === "string" ? value : null;
}

function isCategoryWinner(value: unknown): value is "teamA" | "teamB" | "tie" {
  return value === "teamA" || value === "teamB" || value === "tie";
}

export function parseComputedTally(value: unknown): PublicComputedTally | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const teamAId = stringField(record, "teamAId");
  const teamBId = stringField(record, "teamBId");
  const teamAWins = numberField(record, "teamAWins");
  const teamBWins = numberField(record, "teamBWins");
  const tiedCategories = numberField(record, "tiedCategories");
  const categoryWinner = record.categoryWinner;
  const computedWinnerTeamId = stringField(record, "computedWinnerTeamId");
  const decidedBy = toDecidedBy(stringField(record, "decidedBy"));
  const rawCategories = Array.isArray(record.categories) ? record.categories : null;

  if (
    teamAId === null ||
    teamBId === null ||
    teamAWins === null ||
    teamBWins === null ||
    tiedCategories === null ||
    !isCategoryWinner(categoryWinner) ||
    computedWinnerTeamId === null ||
    decidedBy === null ||
    rawCategories === null
  ) {
    return null;
  }

  const categories: PublicComparedCategory[] = [];

  for (const rawCategory of rawCategories) {
    if (
      typeof rawCategory !== "object" ||
      rawCategory === null ||
      Array.isArray(rawCategory)
    ) {
      return null;
    }

    const category = rawCategory as Record<string, unknown>;
    const slug = stringField(category, "slug");
    const winner = category.winner;
    const teamAValue = category.teamAValue;
    const teamBValue = category.teamBValue;
    const decidedByPolicy = category.decidedByPolicy;

    if (
      slug === null ||
      !isCategoryWinner(winner) ||
      (teamAValue !== null &&
        !(typeof teamAValue === "number" && Number.isFinite(teamAValue))) ||
      (teamBValue !== null &&
        !(typeof teamBValue === "number" && Number.isFinite(teamBValue))) ||
      (decidedByPolicy !== undefined && typeof decidedByPolicy !== "string")
    ) {
      return null;
    }

    categories.push({
      slug,
      winner,
      teamAValue,
      teamBValue,
      ...(typeof decidedByPolicy === "string" ? { decidedByPolicy } : {}),
    });
  }

  return {
    teamAId,
    teamBId,
    teamAWins,
    teamBWins,
    tiedCategories,
    categoryWinner,
    computedWinnerTeamId,
    decidedBy,
    categories,
  };
}

function sideForTeam(
  tally: PublicTallyLike,
  teamId: string | null | undefined,
): "teamA" | "teamB" | null {
  if (teamId === tally.teamAId) {
    return "teamA";
  }

  if (teamId === tally.teamBId) {
    return "teamB";
  }

  return null;
}

export function tallyParts(
  matchup: Pick<
    PublicMatchup,
    "computedTally" | "liveTally" | "highTeam" | "lowTeam"
  >,
): { highWins: number; lowWins: number; ties: number } | null {
  const tally = displayTally(matchup)?.tally ?? null;

  if (tally === null) {
    return null;
  }

  const highSide = sideForTeam(tally, matchup.highTeam?.id);
  const lowSide = sideForTeam(tally, matchup.lowTeam?.id);

  if (highSide !== null && lowSide !== null) {
    return {
      highWins: highSide === "teamA" ? tally.teamAWins : tally.teamBWins,
      lowWins: lowSide === "teamA" ? tally.teamAWins : tally.teamBWins,
      ties: tally.tiedCategories,
    };
  }

  return {
    highWins: tally.teamAWins,
    lowWins: tally.teamBWins,
    ties: tally.tiedCategories,
  };
}

export function formatTally(
  matchup: Pick<
    PublicMatchup,
    "computedTally" | "liveTally" | "highTeam" | "lowTeam"
  >,
): string | null {
  const parts = tallyParts(matchup);

  return parts === null
    ? null
    : `${parts.highWins}-${parts.lowWins}-${parts.ties}`;
}

export function formatCategoryValue(slug: string, value: number | null): string {
  if (value === null) {
    return "-";
  }

  if (slug === "avg") {
    return value.toFixed(3).replace(/^0/, "");
  }

  if (slug === "era" || slug === "whip") {
    return value.toFixed(2);
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(3).replace(/\.?0+$/, "");
}

function policyLabel(policy: string | undefined): string | null {
  if (policy === "innings_minimum") {
    return "IP minimum";
  }

  return policy ?? null;
}

export function categoryStatLines(
  matchup: Pick<
    PublicMatchup,
    "computedTally" | "liveTally" | "highTeam" | "lowTeam"
  >,
  statCategories: readonly PublicStatCategory[],
): CategoryStatLine[] {
  const tally = displayTally(matchup)?.tally ?? null;

  if (tally === null) {
    return [];
  }

  const categoryLabels = new Map(
    statCategories
      .filter((category) => !category.is_only_display_stat)
      .map((category) => [category.slug, category.display_name]),
  );
  const highSide = sideForTeam(tally, matchup.highTeam?.id) ?? "teamA";
  const lowSide = sideForTeam(tally, matchup.lowTeam?.id) ?? "teamB";

  return tally.categories.map((category) => {
    const highValue =
      highSide === "teamA" ? category.teamAValue : category.teamBValue;
    const lowValue =
      lowSide === "teamA" ? category.teamAValue : category.teamBValue;
    const winner =
      category.winner === "tie"
        ? "tie"
        : category.winner === highSide
          ? "high"
          : "low";

    return {
      slug: category.slug,
      label: categoryLabels.get(category.slug) ?? category.slug.toUpperCase(),
      highValue: formatCategoryValue(category.slug, highValue),
      lowValue: formatCategoryValue(category.slug, lowValue),
      winner,
      policyLabel: policyLabel(category.decidedByPolicy),
    };
  });
}

export function matchupStatusView(
  matchup: Pick<PublicMatchup, "status"> &
    Partial<Pick<PublicMatchup, "computedTally" | "liveTally">>,
  upstreamUnderReview = false,
): {
  label: string;
  tone: "stone" | "rose" | "amber" | "emerald";
  bannerTitle: string | null;
  bannerText: string | null;
} {
  if (matchup.status === "under_review") {
    return {
      label: "under review",
      tone: "rose",
      bannerTitle: "Commissioner review",
      bannerText:
        "A stat correction is being reviewed before this result and branch are settled.",
    };
  }

  if (upstreamUnderReview) {
    return {
      label: "commissioner review",
      tone: "amber",
      bannerTitle: null,
      bannerText: null,
    };
  }

  if (isLiveMatchup(matchup)) {
    return {
      label: "live",
      tone: "rose",
      bannerTitle: null,
      bannerText: null,
    };
  }

  if (matchup.status === "provisional") {
    return {
      label: "provisional",
      tone: "amber",
      bannerTitle: null,
      bannerText: null,
    };
  }

  if (matchup.status === "final") {
    return {
      label: "final",
      tone: "emerald",
      bannerTitle: null,
      bannerText: null,
    };
  }

  return {
    label: "pending",
    tone: "stone",
    bannerTitle: null,
    bannerText: null,
  };
}

export function resultExplanation(
  matchup: Pick<
    PublicMatchup,
    | "status"
    | "computedTally"
    | "liveTally"
    | "computedWinner"
    | "overrideWinner"
    | "decidedBy"
    | "highTeam"
    | "lowTeam"
  >,
): string {
  const winner = effectiveWinner(matchup);
  const decidedBy = formatDecidedBy(matchup.decidedBy);
  const decisionText = decidedBy === null ? "" : ` by ${decidedBy}`;

  if (matchup.status === "under_review") {
    return "Commissioner review: a stat correction is being reviewed, so this result and its downstream branch are paused.";
  }

  if (matchup.computedTally === null && matchup.liveTally !== null) {
    const leader = liveLeader(matchup);
    const score = formatTally(matchup);
    const lead =
      leader === null ? `Live: tied ${score}.` : `Live: ${leader.name} leads ${score}.`;

    return `${lead} Updates with each stats import; nothing is decided until the week closes.`;
  }

  if (matchup.computedTally === null || winner === null) {
    return "Result not yet computed.";
  }

  if (matchup.status === "provisional") {
    return `Provisional result: ${winner.name} advances${decisionText}. This is still inside the stat-correction window.`;
  }

  if (matchup.status === "final") {
    return `Final result: ${winner.name} advanced${decisionText}.`;
  }

  if (matchup.status === "live") {
    return `Live result: ${winner.name} leads${decisionText}.`;
  }

  return "Result not yet computed.";
}
