import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { parseCsv, runImportScript } from "./lib/import-common.ts";
import {
  CUMULATIVE_COLUMNS,
  rollUpWeek,
  type CumulativeColumn,
  type CumulativeRow,
  type DayStatRow,
} from "./lib/week-rollup.ts";

const USAGE =
  "node --experimental-strip-types scripts/roll-up-week.ts <week> [--out <path>]";
const DAY_STATS_DIR = "data/stats/days";

const SUMMARY_COLUMNS = [
  "team_id",
  "r",
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
  "innings_pitched",
] as const satisfies readonly CumulativeColumn[];

type CliArgs = {
  week: number;
  outPath: string | null;
};

type DayFile = {
  date: string;
  fileName: string;
  path: string;
};

async function main() {
  const { week, outPath } = parseRollupArgs(process.argv.slice(2));
  const dayFiles = await findDayFiles(week);

  if (dayFiles.length === 0) {
    throw new Error(`No day files found for week ${week} in ${DAY_STATS_DIR}.`);
  }

  const days = await Promise.all(dayFiles.map(readDayFile));
  const rows = rollUpWeek(days);
  const latestDate = dayFiles[dayFiles.length - 1].date;
  const targetPath =
    outPath ?? join("data/stats", `week${week}-${latestDate}-rollup.csv`);

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, stringifyCumulativeRows(rows), "utf8");

  console.log(`Wrote ${rows.length} team roll-up to ${targetPath}`);
  console.log(`Source day files: ${dayFiles.map((file) => file.fileName).join(", ")}`);
  console.log(formatSummaryTable(rows));
}

function parseRollupArgs(argv: readonly string[]): CliArgs {
  const args = argv.filter((arg) => arg !== "--");
  const positional: string[] = [];
  let outPath: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--out") {
      const next = args[index + 1];

      if (next === undefined || next.startsWith("--")) {
        throw new Error(`--out requires a path.\nUsage: ${USAGE}`);
      }

      outPath = next;
      index += 1;
      continue;
    }

    if (arg.startsWith("--out=")) {
      const value = arg.slice("--out=".length);

      if (value === "") {
        throw new Error(`--out requires a path.\nUsage: ${USAGE}`);
      }

      outPath = value;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option "${arg}".\nUsage: ${USAGE}`);
    }

    positional.push(arg);
  }

  if (positional.length !== 1) {
    throw new Error(`Expected exactly one week number.\nUsage: ${USAGE}`);
  }

  const weekText = positional[0];

  if (!/^\d+$/.test(weekText)) {
    throw new Error(`Week must be a positive integer.\nUsage: ${USAGE}`);
  }

  const week = Number(weekText);

  if (!Number.isSafeInteger(week) || week < 1) {
    throw new Error(`Week must be a positive integer.\nUsage: ${USAGE}`);
  }

  return { week, outPath };
}

async function findDayFiles(week: number): Promise<DayFile[]> {
  let fileNames: string[];

  try {
    fileNames = await readdir(DAY_STATS_DIR);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const pattern = new RegExp(`^week${week}-(\\d{4}-\\d{2}-\\d{2})\\.csv$`);

  return fileNames
    .map((fileName) => {
      const match = pattern.exec(fileName);

      if (match === null) {
        return null;
      }

      return {
        date: match[1],
        fileName,
        path: join(DAY_STATS_DIR, fileName),
      };
    })
    .filter((file): file is DayFile => file !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function readDayFile(file: DayFile): Promise<DayStatRow[]> {
  try {
    return parseCsv(await readFile(file.path, "utf8")) as DayStatRow[];
  } catch (error) {
    throw new Error(
      `${file.path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function stringifyCumulativeRows(rows: readonly CumulativeRow[]): string {
  return [
    CUMULATIVE_COLUMNS.join(","),
    ...rows.map((row) =>
      CUMULATIVE_COLUMNS.map((column) => escapeCsvField(row[column])).join(","),
    ),
  ].join("\n").concat("\n");
}

function escapeCsvField(value: string): string {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}

function formatSummaryTable(rows: readonly CumulativeRow[]): string {
  const widths = SUMMARY_COLUMNS.map((column) =>
    Math.max(column.length, ...rows.map((row) => row[column].length)),
  );
  const header = SUMMARY_COLUMNS.map((column, index) =>
    column.padEnd(widths[index]),
  ).join("  ");
  const divider = widths.map((width) => "-".repeat(width)).join("  ");
  const body = rows.map((row) =>
    SUMMARY_COLUMNS.map((column, index) => {
      const value = row[column];
      const width = widths[index];

      return column === "team_id" ? value.padEnd(width) : value.padStart(width);
    }).join("  "),
  );

  return [header, divider, ...body].join("\n");
}

runImportScript(main);
