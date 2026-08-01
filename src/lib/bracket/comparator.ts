import {
  parseCompositeFraction,
  parseInningsPitched,
  parseRatio,
} from "./parsers";

export type WeekStatCategory = {
  slug: string;
  sort_order: "asc" | "desc";
  is_only_display_stat: boolean;
};

export type WeekStats = Record<string, string | number | null | undefined>;

export type CategoryWinner = "teamA" | "teamB" | "tie";

export type ComparedCategory = {
  slug: string;
  winner: CategoryWinner;
  teamAValue: number | null;
  teamBValue: number | null;
  decidedByPolicy?: string;
};

export type WeekComparisonResult = {
  teamAWins: number;
  teamBWins: number;
  tiedCategories: number;
  winner: CategoryWinner;
  categories: ComparedCategory[];
};

export type InningsMinimumPolicyInput = {
  category: WeekStatCategory;
  statsA: WeekStats;
  statsB: WeekStats;
  minInningsPitched: number | null;
};

export type InningsMinimumPolicyDecision =
  | {
      applies: false;
    }
  | {
      applies: true;
      winner: CategoryWinner;
      policyName: string;
    };

export type InningsMinimumPolicy = (
  input: InningsMinimumPolicyInput,
) => InningsMinimumPolicyDecision;

const pitchingRatioCategorySlugs = new Set(["era", "whip"]);

function parseMaybeInningsPitched(
  raw: WeekStats[string],
): number | null {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }

  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }

  const trimmed = raw.trim();

  if (trimmed === "-") {
    return null;
  }

  return parseInningsPitched(trimmed).value;
}

/**
 * Default innings-minimum behavior for Yahoo-style weekly baseball matchups.
 *
 * UNVERIFIED against Yahoo until the Issue 3 spike. The policy seam exists so
 * the spike's findings can replace this behavior without touching compareWeek.
 */
export const defaultInningsMinimumPolicy: InningsMinimumPolicy = ({
  category,
  statsA,
  statsB,
  minInningsPitched,
}) => {
  if (
    minInningsPitched === null ||
    minInningsPitched <= 0 ||
    !pitchingRatioCategorySlugs.has(category.slug)
  ) {
    return { applies: false };
  }

  const inningsA = parseMaybeInningsPitched(statsA.innings_pitched);
  const inningsB = parseMaybeInningsPitched(statsB.innings_pitched);
  const teamAMetMinimum = inningsA !== null && inningsA >= minInningsPitched;
  const teamBMetMinimum = inningsB !== null && inningsB >= minInningsPitched;

  if (teamAMetMinimum && teamBMetMinimum) {
    return { applies: false };
  }

  if (!teamAMetMinimum && !teamBMetMinimum) {
    return {
      applies: true,
      winner: "tie",
      policyName: "innings_minimum",
    };
  }

  return {
    applies: true,
    winner: teamAMetMinimum ? "teamA" : "teamB",
    policyName: "innings_minimum",
  };
};

function parseComparableValue(
  slug: string,
  raw: WeekStats[string],
): number | null {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }

  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }

  const trimmed = raw.trim();

  if (trimmed === "-") {
    return null;
  }

  if (trimmed.includes("/")) {
    return parseCompositeFraction(trimmed).value;
  }

  if (slug === "innings_pitched") {
    return parseInningsPitched(trimmed).value;
  }

  return parseRatio(trimmed).value;
}

function compareValues(
  valueA: number | null,
  valueB: number | null,
  sortOrder: "asc" | "desc",
): CategoryWinner {
  if (valueA === null || valueB === null || valueA === valueB) {
    return "tie";
  }

  if (sortOrder === "asc") {
    return valueA < valueB ? "teamA" : "teamB";
  }

  return valueA > valueB ? "teamA" : "teamB";
}

function addWinner(
  tally: Pick<WeekComparisonResult, "teamAWins" | "teamBWins" | "tiedCategories">,
  winner: CategoryWinner,
): void {
  if (winner === "teamA") {
    tally.teamAWins += 1;
  } else if (winner === "teamB") {
    tally.teamBWins += 1;
  } else {
    tally.tiedCategories += 1;
  }
}

export function compareWeek(
  statsA: WeekStats,
  statsB: WeekStats,
  categories: readonly WeekStatCategory[],
  options: {
    minInningsPitched?: number | null;
    inningsMinimumPolicy?: InningsMinimumPolicy;
  } = {},
): WeekComparisonResult {
  const tally = {
    teamAWins: 0,
    teamBWins: 0,
    tiedCategories: 0,
  };
  const comparedCategories: ComparedCategory[] = [];
  const inningsMinimumPolicy =
    options.inningsMinimumPolicy ?? defaultInningsMinimumPolicy;
  const minInningsPitched = options.minInningsPitched ?? null;

  for (const category of categories) {
    if (category.is_only_display_stat) {
      continue;
    }

    const teamAValue = parseComparableValue(category.slug, statsA[category.slug]);
    const teamBValue = parseComparableValue(category.slug, statsB[category.slug]);
    const policyDecision = inningsMinimumPolicy({
      category,
      statsA,
      statsB,
      minInningsPitched,
    });
    const winner = policyDecision.applies
      ? policyDecision.winner
      : compareValues(teamAValue, teamBValue, category.sort_order);

    addWinner(tally, winner);
    comparedCategories.push({
      slug: category.slug,
      winner,
      teamAValue,
      teamBValue,
      ...(policyDecision.applies
        ? { decidedByPolicy: policyDecision.policyName }
        : {}),
    });
  }

  return {
    ...tally,
    winner:
      tally.teamAWins > tally.teamBWins
        ? "teamA"
        : tally.teamBWins > tally.teamAWins
          ? "teamB"
          : "tie",
    categories: comparedCategories,
  };
}
