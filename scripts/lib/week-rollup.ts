import {
  parseInningsPitched,
  parseRatio,
} from "../../src/lib/bracket/parsers.ts";

export const CUMULATIVE_COLUMNS = [
  "team_id",
  "week",
  "r",
  "2b",
  "3b",
  "hr",
  "rbi",
  "sb",
  "ops",
  "w",
  "bb",
  "k",
  "era",
  "whip",
  "k9",
  "nsvh",
  "at_bats",
  "batting_hits",
  "innings_pitched",
] as const;

const DAY_COLUMNS = [
  "team_id",
  "date",
  "week",
  "r",
  "2b",
  "3b",
  "hr",
  "rbi",
  "sb",
  "ops",
  "w",
  "bb",
  "k",
  "era",
  "whip",
  "k9",
  "nsvh",
  "at_bats",
  "batting_hits",
  "innings_pitched",
] as const;

const INTEGER_SUM_COLUMNS = [
  "r",
  "2b",
  "3b",
  "hr",
  "rbi",
  "sb",
  "w",
  "bb",
  "k",
  "nsvh",
  "at_bats",
  "batting_hits",
] as const;

const SIGNED_INTEGER_COLUMNS: ReadonlySet<IntegerSumColumn> = new Set(["nsvh"]);

export type CumulativeColumn = (typeof CUMULATIVE_COLUMNS)[number];
export type DayColumn = (typeof DAY_COLUMNS)[number];
export type IntegerSumColumn = (typeof INTEGER_SUM_COLUMNS)[number];

export type DayStatRow = Record<DayColumn, string>;
export type CumulativeRow = Record<CumulativeColumn, string>;

type TeamAccumulator = {
  teamId: string;
  week: number;
  integers: Record<IntegerSumColumn, number>;
  inningsOuts: number;
  eraWeightedByOuts: number;
  whipWeightedByOuts: number;
  opsWeightedByAtBats: number;
};

export function parseInnings(s: string): number {
  return parseInningsPitched(s).value;
}

export function formatInnings(n: number): string {
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid innings value: ${n}`);
  }

  const outs = Math.round(n * 3);

  if (Math.abs(outs / 3 - n) > 1e-9) {
    throw new Error(`Innings value is not representable in thirds: ${n}`);
  }

  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

export function rollUpWeek(days: readonly (readonly DayStatRow[])[]): CumulativeRow[] {
  if (days.length === 0) {
    throw new Error("At least one day of stats is required.");
  }

  const firstDayTeams = collectDayTeamIds(days[0], 0);
  const expectedTeamIds = new Set(firstDayTeams);
  const accumulators = new Map(
    firstDayTeams.map((teamId) => [teamId, createAccumulator(teamId)]),
  );
  let expectedWeek: number | null = null;

  for (const [dayIndex, rows] of days.entries()) {
    const dayTeamIds = collectDayTeamIds(rows, dayIndex);
    const dayTeams = new Set(dayTeamIds);

    if (dayIndex > 0) {
      const missing = firstDayTeams.filter((teamId) => !dayTeams.has(teamId));
      const extra = dayTeamIds.filter((teamId) => !expectedTeamIds.has(teamId));

      if (missing.length > 0 || extra.length > 0) {
        throw new Error(
          `Day ${dayIndex + 1} team mismatch: missing [${missing.join(", ")}], extra [${extra.join(", ")}].`,
        );
      }
    }

    for (const [rowIndex, row] of rows.entries()) {
      const context = `Day ${dayIndex + 1} row ${rowIndex + 2}`;
      const rowWeek = parseWeek(requireValue(row, "week", context), context);

      if (expectedWeek === null) {
        expectedWeek = rowWeek;
        for (const accumulator of accumulators.values()) {
          accumulator.week = rowWeek;
        }
      } else if (rowWeek !== expectedWeek) {
        throw new Error(
          `${context}: week ${rowWeek} does not match expected week ${expectedWeek}.`,
        );
      }

      const teamId = requireValue(row, "team_id", context);
      const accumulator = accumulators.get(teamId);

      if (accumulator === undefined) {
        throw new Error(`${context}: unexpected team_id "${teamId}".`);
      }

      addRow(accumulator, row, context);
    }
  }

  return firstDayTeams.map((teamId) => {
    const accumulator = accumulators.get(teamId);

    if (accumulator === undefined) {
      throw new Error(`Missing accumulator for team_id "${teamId}".`);
    }

    return formatAccumulator(accumulator);
  });
}

function createAccumulator(teamId: string): TeamAccumulator {
  return {
    teamId,
    week: 0,
    integers: {
      r: 0,
      "2b": 0,
      "3b": 0,
      hr: 0,
      rbi: 0,
      sb: 0,
      w: 0,
      bb: 0,
      k: 0,
      nsvh: 0,
      at_bats: 0,
      batting_hits: 0,
    },
    inningsOuts: 0,
    eraWeightedByOuts: 0,
    whipWeightedByOuts: 0,
    opsWeightedByAtBats: 0,
  };
}

function collectDayTeamIds(
  rows: readonly DayStatRow[],
  dayIndex: number,
): readonly string[] {
  if (rows.length === 0) {
    throw new Error(`Day ${dayIndex + 1} has no stat rows.`);
  }

  const teamIds = new Set<string>();

  for (const [rowIndex, row] of rows.entries()) {
    const context = `Day ${dayIndex + 1} row ${rowIndex + 2}`;
    assertRequiredColumns(row, context);
    const teamId = requireValue(row, "team_id", context);

    if (teamIds.has(teamId)) {
      throw new Error(`${context}: duplicate team_id "${teamId}".`);
    }

    teamIds.add(teamId);
  }

  return [...teamIds];
}

function assertRequiredColumns(row: DayStatRow, context: string): void {
  for (const column of DAY_COLUMNS) {
    requireValue(row, column, context);
  }
}

function requireValue(row: DayStatRow, column: DayColumn, context: string): string {
  if (!Object.hasOwn(row, column) || row[column] === "") {
    throw new Error(`${context}: missing required column "${column}".`);
  }

  return row[column];
}

function parseWeek(raw: string, context: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${context}: week must be a positive integer.`);
  }

  const week = Number(raw);

  if (!Number.isSafeInteger(week) || week < 1) {
    throw new Error(`${context}: week must be a positive integer.`);
  }

  return week;
}

function addRow(
  accumulator: TeamAccumulator,
  row: DayStatRow,
  context: string,
): void {
  let rowAtBats = 0;
  let rowBattingHits = 0;

  for (const column of INTEGER_SUM_COLUMNS) {
    const value = parseInteger(
      requireValue(row, column, context),
      column,
      context,
    );
    accumulator.integers[column] += value;

    if (column === "at_bats") {
      rowAtBats = value;
    } else if (column === "batting_hits") {
      rowBattingHits = value;
    }
  }

  if (rowBattingHits > rowAtBats) {
    throw new Error(
      `${context}: batting_hits cannot exceed at_bats.`,
    );
  }

  const inningsOuts = parseInningsOuts(
    requireValue(row, "innings_pitched", context),
    context,
  );
  accumulator.inningsOuts += inningsOuts;

  if (inningsOuts > 0) {
    // Yahoo prints "-" on zero-IP days. Those placeholders must not replace
    // or dilute earlier real pitching work in the cumulative ratios.
    accumulator.eraWeightedByOuts +=
      parseNumericRatio(requireValue(row, "era", context), "era", context) *
      inningsOuts;
    accumulator.whipWeightedByOuts +=
      parseNumericRatio(requireValue(row, "whip", context), "whip", context) *
      inningsOuts;
  }

  if (rowAtBats > 0) {
    accumulator.opsWeightedByAtBats +=
      parseNumericRatio(requireValue(row, "ops", context), "ops", context) *
      rowAtBats;
  }

  const k9 = requireValue(row, "k9", context);
  if (inningsOuts > 0 && k9 === "-") {
    throw new Error(`${context}: k9 is "-" despite positive innings_pitched.`);
  }
  if (inningsOuts > 0) {
    parseNumericRatio(k9, "k9", context);
  }
}

function parseInteger(
  raw: string,
  column: IntegerSumColumn,
  context: string,
): number {
  const signed = SIGNED_INTEGER_COLUMNS.has(column);
  const pattern = signed ? /^-?\d+$/ : /^\d+$/;

  if (!pattern.test(raw)) {
    throw new Error(
      `${context}: ${column} must be ${signed ? "an integer" : "a non-negative integer"}.`,
    );
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value)) {
    throw new Error(`${context}: ${column} is outside the safe integer range.`);
  }

  return value;
}

function parseInningsOuts(raw: string, context: string): number {
  try {
    const parsed = parseInningsPitched(raw);
    return parsed.wholeInnings * 3 + parsed.outs;
  } catch {
    throw new Error(
      `${context}: innings_pitched "${raw}" is not valid Yahoo IP notation (thirds are .1/.2).`,
    );
  }
}

function parseNumericRatio(raw: string, column: string, context: string): number {
  if (raw === "-") {
    throw new Error(`${context}: ${column} is "-" despite a positive denominator.`);
  }

  try {
    const parsed = parseRatio(raw);

    if (parsed.value < 0) {
      throw new Error("negative ratio");
    }

    return parsed.value;
  } catch {
    throw new Error(`${context}: ${column} must be a non-negative decimal or "-".`);
  }
}

function formatAccumulator(accumulator: TeamAccumulator): CumulativeRow {
  const totalInnings = accumulator.inningsOuts / 3;

  return {
    team_id: accumulator.teamId,
    week: String(accumulator.week),
    r: String(accumulator.integers.r),
    "2b": String(accumulator.integers["2b"]),
    "3b": String(accumulator.integers["3b"]),
    hr: String(accumulator.integers.hr),
    rbi: String(accumulator.integers.rbi),
    sb: String(accumulator.integers.sb),
    ops: formatOps(accumulator),
    w: String(accumulator.integers.w),
    bb: String(accumulator.integers.bb),
    k: String(accumulator.integers.k),
    era: formatPitchingRatio(accumulator.eraWeightedByOuts, accumulator.inningsOuts),
    whip: formatPitchingRatio(
      accumulator.whipWeightedByOuts,
      accumulator.inningsOuts,
    ),
    k9:
      accumulator.inningsOuts === 0
        ? "-"
        : formatDecimal((accumulator.integers.k * 9) / totalInnings, 2),
    nsvh: String(accumulator.integers.nsvh),
    at_bats: String(accumulator.integers.at_bats),
    batting_hits: String(accumulator.integers.batting_hits),
    innings_pitched: formatInnings(totalInnings),
  };
}

function formatPitchingRatio(weightedByOuts: number, inningsOuts: number): string {
  if (inningsOuts === 0) {
    return "-";
  }

  return formatDecimal(weightedByOuts / inningsOuts, 2);
}

function formatOps(accumulator: TeamAccumulator): string {
  const atBats = accumulator.integers.at_bats;

  if (atBats === 0) {
    return "-";
  }

  const fixed = formatDecimal(accumulator.opsWeightedByAtBats / atBats, 3);

  return fixed.startsWith("0.") ? fixed.slice(1) : fixed;
}

function formatDecimal(value: number, digits: number): string {
  const factor = 10 ** digits;

  return (Math.round((value + 1e-12) * factor) / factor).toFixed(digits);
}
