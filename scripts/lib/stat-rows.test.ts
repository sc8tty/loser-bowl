import { describe, expect, it } from "vitest";

import { SEEDED_STAT_CATEGORIES } from "../../src/config/categories.seed";
import { parseStatsRow } from "./stat-rows";

const KNOWN = new Set(["moonshot-accountants"]);

const validRow: Record<string, string> = {
  team_id: "moonshot-accountants",
  week: "23",
  r: "38",
  hr: "9",
  rbi: "35",
  sb: "6",
  w: "4",
  sv: "3",
  k: "61",
  at_bats: "231",
  batting_hits: "64",
  earned_runs_allowed: "21",
  hits_allowed: "49",
  walks_allowed: "18",
  innings_pitched: "52.1",
};

const options = { knownTeamIds: KNOWN, maxWeek: 25 };

describe("parseStatsRow", () => {
  it("accepts a valid row and recomputes ratios from components", () => {
    const parsed = parseStatsRow(validRow, SEEDED_STAT_CATEGORIES, options);

    expect(parsed.teamId).toBe("moonshot-accountants");
    expect(parsed.week).toBe(23);
    expect(parsed.stats.avg).toBe((64 / 231).toFixed(3));
    // 52.1 IP = 52 1/3 innings; ERA = 21 * 9 / 52.333...
    expect(parsed.stats.era).toBe(((21 * 9) / (52 + 1 / 3)).toFixed(2));
    expect(parsed.stats.whip).toBe(((49 + 18) / (52 + 1 / 3)).toFixed(2));
  });

  it("overrides any provided ratio columns with computed values", () => {
    const parsed = parseStatsRow(
      { ...validRow, avg: "0.999" },
      SEEDED_STAT_CATEGORIES,
      options,
    );

    expect(parsed.stats.avg).toBe((64 / 231).toFixed(3));
  });

  it("rejects unknown teams", () => {
    expect(() =>
      parseStatsRow(
        { ...validRow, team_id: "nobody" },
        SEEDED_STAT_CATEGORIES,
        options,
      ),
    ).toThrow(/unknown team_id/i);
  });

  it("rejects invalid IP thirds notation", () => {
    expect(() =>
      parseStatsRow(
        { ...validRow, innings_pitched: "52.4" },
        SEEDED_STAT_CATEGORIES,
        options,
      ),
    ).toThrow(/IP notation/i);
  });

  it("rejects a missing support column", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { hits_allowed: _dropped, ...withoutHitsAllowed } = validRow;

    expect(() =>
      parseStatsRow(withoutHitsAllowed, SEEDED_STAT_CATEGORIES, options),
    ).toThrow(/hits_allowed/);
  });

  it("rejects batting hits exceeding at-bats", () => {
    expect(() =>
      parseStatsRow(
        { ...validRow, batting_hits: "300" },
        SEEDED_STAT_CATEGORIES,
        options,
      ),
    ).toThrow(/cannot exceed/i);
  });

  it("rejects weeks outside the season", () => {
    expect(() =>
      parseStatsRow({ ...validRow, week: "30" }, SEEDED_STAT_CATEGORIES, options),
    ).toThrow();
  });

  it("emits '-' for zero-IP ratios instead of fabricating a best-possible ERA/WHIP", () => {
    const parsed = parseStatsRow(
      {
        ...validRow,
        innings_pitched: "0",
        earned_runs_allowed: "0",
        hits_allowed: "0",
        walks_allowed: "0",
      },
      SEEDED_STAT_CATEGORIES,
      options,
    );

    expect(parsed.stats.era).toBe("-");
    expect(parsed.stats.whip).toBe("-");
  });

  it("emits '-' for zero-AB average instead of a worst-possible .000", () => {
    const parsed = parseStatsRow(
      { ...validRow, at_bats: "0", batting_hits: "0" },
      SEEDED_STAT_CATEGORIES,
      options,
    );

    expect(parsed.stats.avg).toBe("-");
  });
});
