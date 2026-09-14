import { LEAGUE_CONFIG } from "../../config/league.ts";
import { getValidAccessToken } from "./tokens.ts";

const LEAGUE_STATS_URL_BASE =
  "https://fantasysports.yahooapis.com/fantasy/v2/league";

const COUNTING_STAT_ID_TO_SLUG = {
  "7": "r",
  "10": "2b",
  "11": "3b",
  "12": "hr",
  "13": "rbi",
  "16": "sb",
  "28": "w",
  "39": "bb",
  "42": "k",
  "90": "nsvh",
} as const;

const RATIO_STAT_ID_TO_SLUG = {
  "55": "ops",
  "26": "era",
  "27": "whip",
  "57": "k9",
} as const;

const HITS_AT_BATS_STAT_ID = "60";
const INNINGS_PITCHED_STAT_ID = "50";
const AVG_STAT_ID = "3";

export type YahooTeamWeekStats = {
  teamKey: string;
  teamName: string;
  week: number;
  stats: Record<string, string>;
};

export class MissingLeagueKeyError extends Error {
  readonly code = "MISSING_LEAGUE_KEY";

  constructor() {
    super("LEAGUE_KEY is required before fetching Yahoo league stats.");
    this.name = "MissingLeagueKeyError";
  }
}

function hasOwn<T extends object>(object: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requiredString(value: unknown, label: string): string {
  const field = stringField(value);

  if (field === undefined) {
    throw new Error(`Yahoo league stats response was missing ${label}.`);
  }

  return field;
}

function requiredRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Yahoo league stats response was missing ${label}.`);
  }

  return value;
}

function requiredArray(value: unknown, label: string): unknown[] {
  if (!isUnknownArray(value)) {
    throw new Error(`Yahoo league stats response was missing ${label}.`);
  }

  return value;
}

function parseInteger(value: unknown, label: string): number {
  const parsed =
    typeof value === "number" ? value : Number(requiredString(value, label));

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Yahoo league stats response had an invalid ${label}.`);
  }

  return parsed;
}

function defaultStats(): Record<string, string> {
  return {
    r: "0",
    "2b": "0",
    "3b": "0",
    hr: "0",
    rbi: "0",
    sb: "0",
    ops: "-",
    w: "0",
    bb: "0",
    k: "0",
    era: "-",
    whip: "-",
    k9: "-",
    nsvh: "0",
    at_bats: "0",
    batting_hits: "0",
    innings_pitched: "0.0",
  };
}

function normalizeCountingValue(value: string): string {
  return value === "" ? "0" : value;
}

function normalizeRatioValue(value: string): string {
  return value === "" ? "-" : value;
}

function normalizeInningsPitched(value: string): string {
  return value === "" ? "0.0" : value;
}

function normalizeSplitCountingValue(value: string): string {
  return value === "" || value === "-" ? "0" : value;
}

function applyHitsAtBats(stats: Record<string, string>, value: string): void {
  // Before any games Yahoo may send an empty H/AB cell; keep the importer-facing
  // support stats numeric while preserving "-" only for undefined ratios.
  if (value === "") {
    stats.batting_hits = "0";
    stats.at_bats = "0";
    return;
  }

  const parts = value.split("/");

  if (parts.length !== 2) {
    throw new Error("Yahoo league stats response had an invalid H/AB value.");
  }

  stats.batting_hits = normalizeSplitCountingValue(parts[0]);
  stats.at_bats = normalizeSplitCountingValue(parts[1]);
}

function parseTeamIdentity(teamMetadata: readonly unknown[]): {
  teamKey: string;
  teamName: string;
} {
  let teamKey: string | undefined;
  let teamName: string | undefined;

  for (const entry of teamMetadata) {
    if (!isRecord(entry)) {
      continue;
    }

    teamKey = stringField(entry.team_key) ?? teamKey;
    teamName = stringField(entry.name) ?? teamName;
  }

  if (teamKey === undefined) {
    throw new Error("Yahoo league stats response was missing team_key.");
  }

  if (teamName === undefined) {
    throw new Error("Yahoo league stats response was missing team name.");
  }

  return { teamKey, teamName };
}

function parseTeamStats(teamEntry: unknown): YahooTeamWeekStats {
  const teamRecord = requiredRecord(teamEntry, "team entry");
  const team = requiredArray(teamRecord.team, "team array");
  const teamMetadata = requiredArray(team[0], "team metadata");
  const { teamKey, teamName } = parseTeamIdentity(teamMetadata);
  const statsWrapper = requiredRecord(team[1], "team stats wrapper");
  const teamStats = requiredRecord(statsWrapper.team_stats, "team_stats");
  const week = parseInteger(teamStats.week, "team_stats.week");
  const statEntries = requiredArray(teamStats.stats, "team_stats.stats");
  const stats = defaultStats();

  for (const entry of statEntries) {
    const statWrapper = requiredRecord(entry, "stat entry");
    const stat = requiredRecord(statWrapper.stat, "stat");
    const statId = stringField(stat.stat_id);
    const value = typeof stat.value === "string" ? stat.value : undefined;

    if (statId === undefined || value === undefined) {
      continue;
    }

    if (hasOwn(COUNTING_STAT_ID_TO_SLUG, statId)) {
      stats[COUNTING_STAT_ID_TO_SLUG[statId]] = normalizeCountingValue(value);
      continue;
    }

    if (hasOwn(RATIO_STAT_ID_TO_SLUG, statId)) {
      stats[RATIO_STAT_ID_TO_SLUG[statId]] = normalizeRatioValue(value);
      continue;
    }

    if (statId === HITS_AT_BATS_STAT_ID) {
      applyHitsAtBats(stats, value);
      continue;
    }

    if (statId === INNINGS_PITCHED_STAT_ID) {
      stats.innings_pitched = normalizeInningsPitched(value);
      continue;
    }

    if (statId === AVG_STAT_ID) {
      continue;
    }
  }

  return { teamKey, teamName, week, stats };
}

function parseLeagueWeekStats(json: unknown): YahooTeamWeekStats[] {
  const root = requiredRecord(json, "root object");
  const fantasyContent = requiredRecord(
    root.fantasy_content,
    "fantasy_content",
  );
  const league = requiredArray(fantasyContent.league, "league array");
  const leagueStats = requiredRecord(league[1], "league stats");
  const teams = requiredRecord(leagueStats.teams, "teams");
  const count = parseInteger(teams.count, "teams.count");
  const result: YahooTeamWeekStats[] = [];

  // Yahoo returns teams as an object keyed by stringified indexes, not as an
  // array; object key order would put "10" before "2".
  for (let index = 0; index < count; index += 1) {
    result.push(parseTeamStats(teams[String(index)]));
  }

  return result;
}

async function parseLeagueStatsError(response: Response): Promise<Error> {
  let description: string | undefined;

  try {
    const json = (await response.json()) as unknown;

    if (isRecord(json) && isRecord(json.error)) {
      description = stringField(json.error.description);
    }
  } catch {
    description = undefined;
  }

  return new Error(
    `Yahoo league stats request failed with status ${response.status}${
      description === undefined ? "" : `: ${description}`
    }`,
  );
}

export async function fetchLeagueWeekStats(
  week: number,
): Promise<YahooTeamWeekStats[]> {
  const leagueKey = LEAGUE_CONFIG.leagueKey;

  if (leagueKey === null) {
    throw new MissingLeagueKeyError();
  }

  const token = await getValidAccessToken();
  const response = await fetch(
    `${LEAGUE_STATS_URL_BASE}/${leagueKey}/teams/stats;type=week;week=${week}?format=json`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      // Runs unattended from the visit-triggered sync; a dead socket must not
      // hold the sync lock for the route's whole maxDuration.
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    throw await parseLeagueStatsError(response);
  }

  return parseLeagueWeekStats((await response.json()) as unknown);
}
