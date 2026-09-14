import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { leagueSettings, statLines, teams as teamsTable } from "@/db/schema";
import { LEAGUE_CONFIG } from "@/config/league";
import { SEEDED_STAT_CATEGORIES, type StatCategory } from "@/config/categories.seed";
import { stableJson } from "@/lib/admin/state";
import { dateKeyInTimeZone } from "@/lib/bracket/phase";
import { parseStatsRow } from "@/lib/stats/stat-rows";

export type YahooTeamWeekStats = {
  teamKey: string;
  teamName: string;
  week: number;
  stats: Record<string, string>;
};

export type FetchLeagueWeekStats = (week: number) => Promise<YahooTeamWeekStats[]>;

export type YahooWeekSyncResult = {
  week: number;
  fetched: number;
  written: number;
  unchanged: number;
  skippedNoGames: boolean;
  unmappedTeamKeys: string[];
};

export type YahooSyncResult = {
  weeks: YahooWeekSyncResult[];
  wroteData: boolean;
};

/**
 * Every bowl week that has started in league time — the current round plus
 * any earlier ones. Closed weeks stay in the set on purpose: Yahoo posts stat
 * corrections after a day is final, and a closed round is only provisional
 * until its correction window ends, so a late fix still has to land.
 */
export function bowlWeeksToSync(now: Date): number[] {
  const today = dateKeyInTimeZone(now, LEAGUE_CONFIG.timeZone);

  return LEAGUE_CONFIG.rounds
    .filter((round) => round.start <= today)
    .map((round) => round.week);
}

const NO_GAMES_RATIO = "-";

/**
 * Before a week's first game Yahoo reports every stat as empty, which the
 * client normalises to zeros and "-". Writing that row would replace the
 * site's "No stats imported for Week N yet" with a meaningless 0-0 tally and
 * mark the sync as having written data. Detect it and leave the week alone.
 */
export function isNoGamesRow(stats: Record<string, string>): boolean {
  return Object.entries(stats).every(([slug, value]) => {
    if (slug === "innings_pitched") {
      return value === "0.0";
    }

    if (slug === "ops" || slug === "era" || slug === "whip" || slug === "k9" || slug === "avg") {
      return value === NO_GAMES_RATIO;
    }

    return value === "0";
  });
}

async function loadCategories(): Promise<readonly StatCategory[]> {
  const db = getDb();
  const rows = await db
    .select({ statCategories: leagueSettings.statCategories })
    .from(leagueSettings)
    .where(eq(leagueSettings.season, LEAGUE_CONFIG.season))
    .limit(1);
  const stored = rows[0]?.statCategories;

  return Array.isArray(stored) && stored.length > 0
    ? (stored as StatCategory[])
    : SEEDED_STAT_CATEGORIES;
}

export async function syncYahooStats(
  options: { now?: () => Date; fetchWeek: FetchLeagueWeekStats },
): Promise<YahooSyncResult> {
  const now = options.now?.() ?? new Date();
  const weeks = bowlWeeksToSync(now);
  const db = getDb();

  const [categories, teamRows] = await Promise.all([
    loadCategories(),
    db
      .select({ id: teamsTable.id, yahooTeamKey: teamsTable.yahooTeamKey })
      .from(teamsTable),
  ]);
  const teamIdByKey = new Map(
    teamRows
      .filter((team) => team.yahooTeamKey !== null)
      .map((team) => [team.yahooTeamKey as string, team.id]),
  );
  const knownTeamIds = new Set(teamRows.map((team) => team.id));
  const maxWeek = LEAGUE_CONFIG.rounds[LEAGUE_CONFIG.rounds.length - 1].week;

  const results: YahooWeekSyncResult[] = [];

  for (const week of weeks) {
    const fetched = await options.fetchWeek(week);
    const unmappedTeamKeys: string[] = [];
    const parsed: { teamId: string; stats: Record<string, string> }[] = [];

    for (const team of fetched) {
      const teamId = teamIdByKey.get(team.teamKey);

      if (teamId === undefined) {
        unmappedTeamKeys.push(team.teamKey);
        continue;
      }

      const line = parseStatsRow(
        { team_id: teamId, week: String(week), ...team.stats },
        categories,
        { knownTeamIds, maxWeek },
      );

      parsed.push({ teamId, stats: line.stats });
    }

    if (parsed.length > 0 && parsed.every((line) => isNoGamesRow(line.stats))) {
      results.push({
        week,
        fetched: fetched.length,
        written: 0,
        unchanged: 0,
        skippedNoGames: true,
        unmappedTeamKeys,
      });
      continue;
    }

    const existing = await db
      .select({ teamId: statLines.teamId, stats: statLines.stats })
      .from(statLines)
      .where(
        and(
          eq(statLines.week, week),
          inArray(
            statLines.teamId,
            parsed.map((line) => line.teamId),
          ),
        ),
      );
    const existingByTeam = new Map(
      existing.map((row) => [row.teamId, stableJson(row.stats)]),
    );

    // Only rows whose stats actually changed are written, so wroteData — and
    // therefore the site's "Updated" stamp — means "the numbers moved", not
    // "the sync ran".
    const changed = parsed.filter(
      (line) => existingByTeam.get(line.teamId) !== stableJson(line.stats),
    );

    if (changed.length > 0) {
      await db
        .insert(statLines)
        .values(
          changed.map((line) => ({
            teamId: line.teamId,
            week,
            stats: line.stats,
            source: "yahoo" as const,
            syncRunId: null,
          })),
        )
        .onConflictDoUpdate({
          target: [statLines.teamId, statLines.week],
          set: {
            stats: sql`excluded.stats`,
            source: sql`excluded.source`,
            syncRunId: sql`excluded.sync_run_id`,
            syncedAt: sql`now()`,
          },
        });
    }

    results.push({
      week,
      fetched: fetched.length,
      written: changed.length,
      unchanged: parsed.length - changed.length,
      skippedNoGames: false,
      unmappedTeamKeys,
    });
  }

  return {
    weeks: results,
    wroteData: results.some((week) => week.written > 0),
  };
}
