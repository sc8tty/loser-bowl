import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SEEDED_STAT_CATEGORIES } from "../../config/categories.seed.ts";
import { parseStatsRow } from "../stats/stat-rows.ts";
import week24Fixture from "./__fixtures__/league-teams-stats-week24.json";
import week25EmptyFixture from "./__fixtures__/league-teams-stats-week25-empty.json";

const yahooState = vi.hoisted(() => ({
  getValidAccessToken: vi.fn<() => Promise<string>>(),
  leagueConfig: {
    leagueKey: "469.l.16468" as string | null,
  },
}));

vi.mock("./tokens.ts", () => ({
  getValidAccessToken: yahooState.getValidAccessToken,
}));

vi.mock("../../config/league.ts", () => ({
  LEAGUE_CONFIG: yahooState.leagueConfig,
}));

import {
  fetchLeagueWeekStats,
  MissingLeagueKeyError,
  type YahooTeamWeekStats,
} from "./client.ts";

const TOKEN = "test-token";
const SLUMP_BUSTERS_STATS = {
  r: "24",
  "2b": "13",
  "3b": "0",
  hr: "6",
  rbi: "21",
  sb: "5",
  ops: ".689",
  w: "2",
  bb: "15",
  k: "36",
  era: "4.73",
  whip: "1.39",
  k9: "10.02",
  nsvh: "3",
  at_bats: "190",
  batting_hits: "40",
  innings_pitched: "32.1",
};
const EMPTY_STATS = {
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

function stubJsonResponse(body: unknown, status = 200): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetchMock = vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

function findTeam(teams: readonly YahooTeamWeekStats[], teamKey: string): YahooTeamWeekStats {
  const team = teams.find((entry) => entry.teamKey === teamKey);

  if (team === undefined) {
    throw new Error(`Expected fixture team ${teamKey} to be present.`);
  }

  return team;
}

function yahooTeamId(teamKey: string): string {
  const match = /\.t\.(\d+)$/.exec(teamKey);

  if (match === null) {
    throw new Error(`Expected Yahoo team key to end with a team id: ${teamKey}`);
  }

  return match[1];
}

function expectRowsAcceptedByImporter(teams: readonly YahooTeamWeekStats[]): void {
  const knownTeamIds = new Set(teams.map((team) => yahooTeamId(team.teamKey)));

  for (const team of teams) {
    expect(() =>
      parseStatsRow(
        {
          team_id: yahooTeamId(team.teamKey),
          week: String(team.week),
          ...team.stats,
        },
        SEEDED_STAT_CATEGORIES,
        { knownTeamIds, maxWeek: 26 },
      ),
    ).not.toThrow();
  }
}

beforeEach(() => {
  yahooState.getValidAccessToken.mockReset();
  yahooState.getValidAccessToken.mockResolvedValue(TOKEN);
  yahooState.leagueConfig.leagueKey = "469.l.16468";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchLeagueWeekStats", () => {
  it("fetches and parses week 24 team stats from Yahoo", async () => {
    const fetchMock = stubJsonResponse(week24Fixture);

    const teams = await fetchLeagueWeekStats(24);

    expect(teams).toHaveLength(16);
    expect(findTeam(teams, "469.l.16468.t.12")).toEqual({
      teamKey: "469.l.16468.t.12",
      teamName: "SLUMP BUSTERS",
      week: 24,
      stats: SLUMP_BUSTERS_STATS,
    });
    expect(findTeam(teams, "469.l.16468.t.4").stats.nsvh).toBe("-2");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://fantasysports.yahooapis.com/fantasy/v2/league/469.l.16468/teams/stats;type=week;week=24?format=json",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
        },
        signal: expect.any(AbortSignal),
      },
    );
  });

  it("normalizes empty week 25 team stats for teams with no games yet", async () => {
    stubJsonResponse(week25EmptyFixture);

    const teams = await fetchLeagueWeekStats(25);

    expect(teams).toHaveLength(16);

    for (const team of teams) {
      expect(team.week).toBe(25);
      expect(team.stats).toEqual(EMPTY_STATS);
    }
  });

  it("emits fixture rows accepted by the stats importer parser", async () => {
    stubJsonResponse(week24Fixture);
    const week24Teams = await fetchLeagueWeekStats(24);

    stubJsonResponse(week25EmptyFixture);
    const week25Teams = await fetchLeagueWeekStats(25);

    expectRowsAcceptedByImporter(week24Teams);
    expectRowsAcceptedByImporter(week25Teams);
  });

  it("ignores unknown stat ids", async () => {
    stubJsonResponse({
      fantasy_content: {
        league: [
          {},
          {
            teams: {
              count: "1",
              "0": {
                team: [
                  [
                    { team_key: "469.l.16468.t.99" },
                    { team_id: "99" },
                    { name: "Future Category Test" },
                  ],
                  {
                    team_stats: {
                      week: "24",
                      stats: [
                        { stat: { stat_id: "9999", value: "surprise" } },
                        { stat: { stat_id: "7", value: "2" } },
                      ],
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });

    await expect(fetchLeagueWeekStats(24)).resolves.toEqual([
      {
        teamKey: "469.l.16468.t.99",
        teamName: "Future Category Test",
        week: 24,
        stats: { ...EMPTY_STATS, r: "2" },
      },
    ]);
  });

  it("throws sanitized Yahoo API errors", async () => {
    yahooState.getValidAccessToken.mockResolvedValue("secret-token");
    stubJsonResponse(
      { error: { description: "league is forbidden" } },
      403,
    );

    let message = "";

    try {
      await fetchLeagueWeekStats(24);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      message = error instanceof Error ? error.message : "";
    }

    expect(message).toContain("403");
    expect(message).toContain("league is forbidden");
    expect(message).not.toContain("secret-token");
    expect(message).not.toContain("Bearer");
  });

  it("throws MissingLeagueKeyError when LEAGUE_KEY is not configured", async () => {
    yahooState.leagueConfig.leagueKey = null;

    await expect(fetchLeagueWeekStats(24)).rejects.toBeInstanceOf(
      MissingLeagueKeyError,
    );
    expect(yahooState.getValidAccessToken).not.toHaveBeenCalled();
  });
});
