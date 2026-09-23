export type DecidedBy =
  | "categories"
  | "h2h_series"
  | "season_cat_wins"
  | "seed";

export type TiebreakerMatchupResult = {
  teamAId: string;
  teamBId: string;
  teamAWins?: number;
  teamBWins?: number;
  categoryWinsA?: number;
  categoryWinsB?: number;
};

export type RegularSeasonMatchupRow = {
  teamAId: string;
  teamBId: string;
  winnerTeamId: string | null;
};

export type OutcomeTotalsLike = {
  category_wins?: number | null;
};

export type TiebreakerContext = {
  regularSeasonMatchups: readonly RegularSeasonMatchupRow[];
  outcomeTotalsByTeamId: Record<string, OutcomeTotalsLike | undefined>;
  seedsByTeamId: Record<string, number | undefined>;
};

export type TiebreakerResult = {
  winnerTeamId: string;
  decidedBy: DecidedBy;
};

function matchupCategoryWins(
  result: TiebreakerMatchupResult,
  side: "A" | "B",
): number {
  // Missing win counts are corrupt input, not zero — defaulting to 0-0 would
  // silently route a garbage result into the tiebreaker chain (max-review
  // finding F).
  const wins =
    side === "A"
      ? (result.teamAWins ?? result.categoryWinsA)
      : (result.teamBWins ?? result.categoryWinsB);

  if (typeof wins !== "number" || !Number.isFinite(wins) || wins < 0) {
    throw new Error(
      `Tiebreaker input is missing category win counts for team ${side}.`,
    );
  }

  return wins;
}

function rowContainsPair(
  row: RegularSeasonMatchupRow,
  teamAId: string,
  teamBId: string,
): boolean {
  return (
    (row.teamAId === teamAId && row.teamBId === teamBId) ||
    (row.teamAId === teamBId && row.teamBId === teamAId)
  );
}

function outcomeCategoryWins(
  outcomeTotals: OutcomeTotalsLike | undefined,
): number | null {
  return typeof outcomeTotals?.category_wins === "number"
    ? outcomeTotals.category_wins
    : null;
}

export function applyTiebreakers(
  matchupResult: TiebreakerMatchupResult,
  context: TiebreakerContext,
): TiebreakerResult {
  const teamAWins = matchupCategoryWins(matchupResult, "A");
  const teamBWins = matchupCategoryWins(matchupResult, "B");

  if (teamAWins > teamBWins) {
    return {
      winnerTeamId: matchupResult.teamAId,
      decidedBy: "categories",
    };
  }

  if (teamBWins > teamAWins) {
    return {
      winnerTeamId: matchupResult.teamBId,
      decidedBy: "categories",
    };
  }

  // An EMPTY table is corrupt context, not "these two never played": the
  // league's first tiebreaker is the regular-season head-to-head, and silently
  // scoring it 0-0 skips straight to season totals and can hand the matchup to
  // the wrong team. This table sat empty in production through the whole 2026
  // bowl (the CSV importer was never run, and the Yahoo sync does not populate
  // it), which is exactly the failure this refuses to repeat. A NON-empty table
  // with no row for this pair is a legitimate "never met" and falls through.
  // Same rule the season-totals branch below already applies (max-review F).
  if (context.regularSeasonMatchups.length === 0) {
    throw new Error(
      "Tiebreaker needs the regular-season head-to-head series, but no regular-season matchups are loaded — refusing to skip to season totals on empty data.",
    );
  }

  let headToHeadWinsA = 0;
  let headToHeadWinsB = 0;

  for (const row of context.regularSeasonMatchups) {
    if (!rowContainsPair(row, matchupResult.teamAId, matchupResult.teamBId)) {
      continue;
    }

    if (row.winnerTeamId === matchupResult.teamAId) {
      headToHeadWinsA += 1;
    } else if (row.winnerTeamId === matchupResult.teamBId) {
      headToHeadWinsB += 1;
    } else if (row.winnerTeamId !== null) {
      throw new Error(
        `Regular-season matchup row for this pair names winner "${row.winnerTeamId}", which is neither team — corrupt tiebreaker context.`,
      );
    }
  }

  if (headToHeadWinsA > headToHeadWinsB) {
    return {
      winnerTeamId: matchupResult.teamAId,
      decidedBy: "h2h_series",
    };
  }

  if (headToHeadWinsB > headToHeadWinsA) {
    return {
      winnerTeamId: matchupResult.teamBId,
      decidedBy: "h2h_series",
    };
  }

  const seasonCategoryWinsA = outcomeCategoryWins(
    context.outcomeTotalsByTeamId[matchupResult.teamAId],
  );
  const seasonCategoryWinsB = outcomeCategoryWins(
    context.outcomeTotalsByTeamId[matchupResult.teamBId],
  );

  // The PRD falls through to seed only when season totals are TIED, never when
  // they're missing — absent totals are corrupt context (max-review finding F).
  if (seasonCategoryWinsA === null || seasonCategoryWinsB === null) {
    throw new Error(
      "Tiebreaker context is missing season category-win totals; refusing to skip to the seed terminus on incomplete data.",
    );
  }

  if (seasonCategoryWinsA !== seasonCategoryWinsB) {
    return {
      winnerTeamId:
        seasonCategoryWinsA > seasonCategoryWinsB
          ? matchupResult.teamAId
          : matchupResult.teamBId,
      decidedBy: "season_cat_wins",
    };
  }

  const seedA = context.seedsByTeamId[matchupResult.teamAId];
  const seedB = context.seedsByTeamId[matchupResult.teamBId];

  if (typeof seedA !== "number" || typeof seedB !== "number" || seedA === seedB) {
    throw new Error("Tiebreaker seed terminus requires distinct numeric seeds");
  }

  return {
    winnerTeamId: seedA < seedB ? matchupResult.teamAId : matchupResult.teamBId,
    decidedBy: "seed",
  };
}
