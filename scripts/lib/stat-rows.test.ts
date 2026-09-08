import { describe, expect, it } from "vitest";

import { SEEDED_STAT_CATEGORIES } from "../../src/config/categories.seed";
import { parseStatsRow } from "./stat-rows";

const KNOWN = new Set(["moonshot-accountants"]);

const validRow: Record<string, string> = {
  team_id: "moonshot-accountants",
  week: "23",
  r: "38",
  "2b": "12",
  "3b": "2",
  hr: "9",
  rbi: "35",
  sb: "6",
  ops: "0.745",
  w: "4",
  bb: "22",
  nsvh: "3",
  k: "61",
  era: "3.61",
  whip: "1.28",
  k9: "10.49",
  at_bats: "231",
  batting_hits: "64",
  innings_pitched: "52.1",
};

const options = { knownTeamIds: KNOWN, maxWeek: 25 };

describe("parseStatsRow", () => {
  it("accepts a valid row, recomputes AVG, and trusts the transcribed ratios", () => {
    const parsed = parseStatsRow(validRow, SEEDED_STAT_CATEGORIES, options);

    expect(parsed.teamId).toBe("moonshot-accountants");
    expect(parsed.week).toBe(23);
    expect(parsed.stats.avg).toBe((64 / 231).toFixed(3));
    // OPS/ERA/WHIP/K9 are trusted as transcribed from Yahoo, not derived —
    // Yahoo never exposes the raw components needed to compute them ourselves.
    expect(parsed.stats.ops).toBe("0.745");
    expect(parsed.stats.era).toBe("3.61");
    expect(parsed.stats.whip).toBe("1.28");
    expect(parsed.stats.k9).toBe("10.49");
  });

  it("overrides a provided avg value with the computed value", () => {
    const parsed = parseStatsRow(
      { ...validRow, avg: "0.999" },
      SEEDED_STAT_CATEGORIES,
      options,
    );

    expect(parsed.stats.avg).toBe((64 / 231).toFixed(3));
  });

  it("does not override provided ops/era/whip/k9 values (trusted, not derived)", () => {
    const parsed = parseStatsRow(
      { ...validRow, ops: "0.812", era: "2.90", whip: "1.05", k9: "9.20" },
      SEEDED_STAT_CATEGORIES,
      options,
    );

    expect(parsed.stats.ops).toBe("0.812");
    expect(parsed.stats.era).toBe("2.90");
    expect(parsed.stats.whip).toBe("1.05");
    expect(parsed.stats.k9).toBe("9.20");
  });

  it("accepts '-' for a trusted ratio (Yahoo's zero-sample placeholder)", () => {
    const parsed = parseStatsRow(
      { ...validRow, era: "-", whip: "-", k9: "-" },
      SEEDED_STAT_CATEGORIES,
      options,
    );

    expect(parsed.stats.era).toBe("-");
    expect(parsed.stats.whip).toBe("-");
    expect(parsed.stats.k9).toBe("-");
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

  it("rejects a missing required column", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { whip: _dropped, ...withoutWhip } = validRow;

    expect(() =>
      parseStatsRow(withoutWhip, SEEDED_STAT_CATEGORIES, options),
    ).toThrow(/whip/);
  });

  it("rejects a missing support column", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { innings_pitched: _dropped, ...withoutInnings } = validRow;

    expect(() =>
      parseStatsRow(withoutInnings, SEEDED_STAT_CATEGORIES, options),
    ).toThrow(/innings_pitched/);
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

  it("emits '-' for zero-AB average instead of a worst-possible .000", () => {
    const parsed = parseStatsRow(
      { ...validRow, at_bats: "0", batting_hits: "0" },
      SEEDED_STAT_CATEGORIES,
      options,
    );

    expect(parsed.stats.avg).toBe("-");
  });
});

describe("signed counting stats", () => {
  const base = {
    team_id: "signed-team",
    week: "24",
    r: "2", "2b": "2", "3b": "0", hr: "1", rbi: "3", sb: "0",
    ops: "1.031",
    w: "1", bb: "3", k: "3",
    era: "2.08", whip: "1.38", k9: "6.23",
    nsvh: "-2",
    at_bats: "22", batting_hits: "8", innings_pitched: "4.1",
  };
  const opts = { knownTeamIds: new Set(["signed-team"]), maxWeek: 26 };

  it("accepts a negative NSVH (blown save nets below zero, as Yahoo prints it)", () => {
    expect(parseStatsRow(base, SEEDED_STAT_CATEGORIES, opts).stats.nsvh).toBe("-2");
  });

  it("still rejects a negative value in any other counting category", () => {
    expect(() =>
      parseStatsRow({ ...base, r: "-1" }, SEEDED_STAT_CATEGORIES, opts),
    ).toThrow(/non-negative/);
  });
});
