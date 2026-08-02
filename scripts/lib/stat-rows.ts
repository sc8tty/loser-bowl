import { z } from "zod";

import {
  parseInningsPitched,
  type ParsedInningsPitched,
} from "../../src/lib/bracket/parsers.ts";
import type { StatCategory } from "../../src/config/categories.seed.ts";

export const SUPPORT_STAT_SLUGS = [
  "at_bats",
  "batting_hits",
  "earned_runs_allowed",
  "hits_allowed",
  "walks_allowed",
  "innings_pitched",
] as const;

const RATIO_SLUGS = ["avg", "era", "whip"] as const;

const countingStat = z
  .string()
  .regex(/^\d+$/, "must be a non-negative integer");

export type StatsCsvRow = Record<string, string>;

export type ParsedStatLine = {
  teamId: string;
  week: number;
  stats: Record<string, string>;
};

function inningsPitchedOrThrow(value: string): ParsedInningsPitched {
  try {
    return parseInningsPitched(value);
  } catch {
    throw new Error(
      `innings_pitched "${value}" is not valid Yahoo IP notation (thirds are .1/.2).`,
    );
  }
}

/**
 * Zero denominators emit Yahoo's "-" placeholder, NOT a fabricated 0.000/0.00 —
 * a fabricated ratio hands best-possible ERA/WHIP (or worst-possible AVG) to a
 * team that did nothing, in exactly the abandoned-lineup scenario manual mode
 * exists for (cold-review P2-1). "-" parses to null and the final-mode
 * comparator surfaces it loudly for the commissioner.
 */
function ratio(numerator: number, denominator: number, digits: number): string {
  if (denominator === 0) {
    return "-";
  }

  return (numerator / denominator).toFixed(digits);
}

/**
 * Validates one stats CSV row against the league's scoring categories and
 * recomputes AVG/ERA/WHIP from support components — provided ratio columns
 * are ignored (single computation path, warned upstream).
 */
export function parseStatsRow(
  row: StatsCsvRow,
  categories: readonly StatCategory[],
  options: { knownTeamIds: ReadonlySet<string>; maxWeek: number },
): ParsedStatLine {
  const teamId = z.string().min(1).parse(row.team_id);

  if (!options.knownTeamIds.has(teamId)) {
    throw new Error(`Unknown team_id "${teamId}" — team must exist before importing stats.`);
  }

  const week = z.coerce.number().int().min(1).max(options.maxWeek).parse(row.week);

  const requiredCounting = categories
    .filter(
      (category) =>
        !category.is_only_display_stat &&
        !RATIO_SLUGS.includes(category.slug as (typeof RATIO_SLUGS)[number]),
    )
    .map((category) => category.slug);

  const stats: Record<string, string> = {};

  for (const slug of requiredCounting) {
    const value = row[slug];

    if (value === undefined || value === "") {
      throw new Error(`Missing required category column "${slug}".`);
    }

    stats[slug] = countingStat.parse(value);
  }

  for (const slug of SUPPORT_STAT_SLUGS) {
    const value = row[slug];

    if (value === undefined || value === "") {
      throw new Error(`Missing required support column "${slug}".`);
    }

    if (slug === "innings_pitched") {
      inningsPitchedOrThrow(value);
      stats[slug] = value;
    } else {
      stats[slug] = countingStat.parse(value);
    }
  }

  const atBats = Number(stats.at_bats);
  const battingHits = Number(stats.batting_hits);
  const earnedRuns = Number(stats.earned_runs_allowed);
  const hitsAllowed = Number(stats.hits_allowed);
  const walksAllowed = Number(stats.walks_allowed);
  const innings = inningsPitchedOrThrow(stats.innings_pitched).value;

  if (battingHits > atBats) {
    throw new Error(
      `batting_hits (${battingHits}) cannot exceed at_bats (${atBats}).`,
    );
  }

  stats.avg = ratio(battingHits, atBats, 3);
  stats.era = innings === 0 ? "-" : ((earnedRuns * 9) / innings).toFixed(2);
  stats.whip =
    innings === 0 ? "-" : ((hitsAllowed + walksAllowed) / innings).toFixed(2);

  return { teamId, week, stats };
}
