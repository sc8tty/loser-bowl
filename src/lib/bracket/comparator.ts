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
  /** Mid-week ("live") data legitimately lacks IP; only "final" is strict. */
  mode: "live" | "final";
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

  if (typeof raw !== "number") {
    const trimmed = raw.trim();

    if (trimmed === "-") {
      return null;
    }
  }

  // Numeric input routes through the parser too, so decimal-vs-thirds
  // ambiguity throws instead of silently misreading (max-review finding D).
  return parseInningsPitched(raw).value;
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
  mode,
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

  if (inningsA === null || inningsB === null) {
    // Live mode: a team with no IP yet is expected mid-week — the policy
    // simply doesn't apply, and the normal null-tolerant comparison renders
    // it (cold-review P2-6).
    if (mode === "live") {
      return { applies: false };
    }

    // Final mode: a MISSING innings_pitched stat is corrupt input, not zero
    // innings — Yahoo always reports IP. Treating absence as "below minimum"
    // would forfeit pitching categories on bad data (max-review finding E).
    throw new Error(
      "Innings-minimum policy requires innings_pitched for both teams; a missing IP stat is a data-integrity error, not a forfeit.",
    );
  }

  const teamAMetMinimum = inningsA >= minInningsPitched;
  const teamBMetMinimum = inningsB >= minInningsPitched;

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

function parseComparable(
  slug: string,
  raw: WeekStats[string],
): number | null {
  // IP must ALWAYS route through the thirds parser — including numeric input,
  // so decimal-vs-thirds ambiguity throws on the compare path too instead of
  // comparing 100.2 against "100.1"'s 100.333 (cold-review P3-1; finding D).
  if (slug === "innings_pitched" && typeof raw === "number") {
    return parseInningsPitched(raw).value;
  }

  return parseComparableValue(slug, raw);
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
    /**
     * "final" (default): a category value present for one team but missing for
     * the other is a data-integrity error and throws — silently scoring it as
     * a tie could decide a matchup on corrupt data (max-review finding H).
     * "live": mid-week partial data is expected (a team with no IP yet shows
     * "-" for ERA); missing values render as ties for display purposes only.
     */
    mode?: "live" | "final";
  } = {},
): WeekComparisonResult {
  const mode = options.mode ?? "final";
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

    const teamAValue = parseComparable(category.slug, statsA[category.slug]);
    const teamBValue = parseComparable(category.slug, statsB[category.slug]);

    // Policy first: a below-minimum team legitimately shows "-" for ERA/WHIP
    // in its final week, and the forfeit must win over the integrity throw
    // (cold-review P2-5).
    const policyDecision = inningsMinimumPolicy({
      category,
      statsA,
      statsB,
      minInningsPitched,
      mode,
    });

    if (
      !policyDecision.applies &&
      mode === "final" &&
      (teamAValue === null || teamBValue === null)
    ) {
      // Either-side null in final data is corrupt input — including BOTH null,
      // which is the signature of a settings-slug/stat-key mismatch that would
      // otherwise 0-0 tie every category (cold-review P3-2; max-review H).
      throw new Error(
        `Category "${category.slug}" is missing a final value (${teamAValue === null ? "team A" : "team B"}${teamAValue === null && teamBValue === null ? " and team B" : ""}) — corrupt final-week data (silent tie refused).`,
      );
    }

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
