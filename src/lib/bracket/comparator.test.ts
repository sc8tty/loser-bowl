import { describe, expect, it } from "vitest";

import type { WeekStatCategory } from "./comparator";
import {
  compareWeek,
  defaultInningsMinimumPolicy,
  forfeitsAllPitching,
} from "./comparator";
import { SEEDED_LEAGUE_SETTINGS } from "@/config/categories.seed";

const categories = [
  {
    slug: "hr",
    sort_order: "desc",
    is_only_display_stat: false,
  },
  {
    slug: "avg",
    sort_order: "desc",
    is_only_display_stat: false,
  },
  {
    slug: "era",
    sort_order: "asc",
    is_only_display_stat: false,
  },
  {
    slug: "whip",
    sort_order: "asc",
    is_only_display_stat: false,
  },
  {
    slug: "innings_pitched",
    sort_order: "desc",
    is_only_display_stat: true,
  },
] as const satisfies readonly WeekStatCategory[];

describe("compareWeek", () => {
  it("tallies category winners, honors sort order, and skips display-only stats", () => {
    const result = compareWeek(
      {
        hr: "8",
        avg: "45/167",
        era: "3.21",
        whip: "1.20",
        innings_pitched: "10.0",
      },
      {
        hr: "8",
        avg: "44/160",
        era: "4.10",
        whip: "1.10",
        innings_pitched: "20.0",
      },
      categories,
    );

    expect(result).toMatchObject({
      teamAWins: 1,
      teamBWins: 2,
      tiedCategories: 1,
      winner: "teamB",
    });
    expect(result.categories.map(({ slug, winner }) => [slug, winner])).toEqual(
      [
        ["hr", "tie"],
        ["avg", "teamB"],
        ["era", "teamA"],
        ["whip", "teamB"],
      ],
    );
  });

  it("counts tied categories for neither side", () => {
    const result = compareWeek(
      { hr: "1", avg: ".250", era: "2.00", whip: "1.00" },
      { hr: "1", avg: ".250", era: "3.00", whip: "1.00" },
      categories,
    );

    expect(result).toMatchObject({
      teamAWins: 1,
      teamBWins: 0,
      tiedCategories: 3,
      winner: "teamA",
    });
  });

  it("forfeits ERA and WHIP when only one team misses the innings minimum", () => {
    const result = compareWeek(
      {
        hr: "1",
        avg: ".300",
        era: "0.00",
        whip: "0.50",
        innings_pitched: "9.2",
      },
      {
        hr: "0",
        avg: ".200",
        era: "9.00",
        whip: "2.00",
        innings_pitched: "12.0",
      },
      categories,
      { minInningsPitched: 12 },
    );

    expect(result.categories.map(({ slug, winner, decidedByPolicy }) => [
      slug,
      winner,
      decidedByPolicy,
    ])).toEqual([
      ["hr", "teamA", undefined],
      ["avg", "teamA", undefined],
      ["era", "teamB", "innings_minimum"],
      ["whip", "teamB", "innings_minimum"],
    ]);
    expect(result).toMatchObject({
      teamAWins: 2,
      teamBWins: 2,
      tiedCategories: 0,
      winner: "tie",
    });
  });

  it("treats ERA and WHIP as ties when both teams miss the innings minimum", () => {
    const result = compareWeek(
      {
        hr: "1",
        avg: ".300",
        era: "0.00",
        whip: "0.50",
        innings_pitched: "9.2",
      },
      {
        hr: "0",
        avg: ".200",
        era: "9.00",
        whip: "2.00",
        innings_pitched: "11.2",
      },
      categories,
      { minInningsPitched: 12 },
    );

    expect(
      result.categories
        .filter(({ decidedByPolicy }) => decidedByPolicy === "innings_minimum")
        .map(({ slug, winner }) => [slug, winner]),
    ).toEqual([
      ["era", "tie"],
      ["whip", "tie"],
    ]);
    expect(result).toMatchObject({
      teamAWins: 2,
      teamBWins: 0,
      tiedCategories: 2,
      winner: "teamA",
    });
  });

  it("lets callers swap the innings-minimum policy", () => {
    const result = compareWeek(
      { hr: "5", avg: "0.280", era: "1.00", whip: "1.00", innings_pitched: "0.0" },
      { hr: "5", avg: "0.280", era: "9.00", whip: "9.00", innings_pitched: "99.0" },
      categories,
      {
        minInningsPitched: 12,
        inningsMinimumPolicy(input) {
          const fallback = defaultInningsMinimumPolicy(input);

          if (fallback.applies && input.category.slug === "era") {
            return {
              applies: true,
              winner: "teamA",
              policyName: "custom_override",
            };
          }

          return fallback;
        },
      },
    );

    expect(result.categories.map(({ slug, winner, decidedByPolicy }) => [
      slug,
      winner,
      decidedByPolicy,
    ])).toEqual([
      ["hr", "tie", undefined],
      ["avg", "tie", undefined],
      ["era", "teamA", "custom_override"],
      ["whip", "teamB", "innings_minimum"],
    ]);
  });
});

// Regression tests for the 2026-08-02 cold review (docs/reviews/issue-5-6a-4a-cold-review.md).
describe("compareWeek regressions from the cold review", () => {
  const eraCategory: WeekStatCategory = {
    slug: "era",
    sort_order: "asc",
    is_only_display_stat: false,
  };
  const hrCategory: WeekStatCategory = {
    slug: "hr",
    sort_order: "desc",
    is_only_display_stat: false,
  };

  it("P2-5: below-minimum forfeit wins over the final-mode integrity throw", () => {
    const result = compareWeek(
      { era: "-", innings_pitched: "0.0" },
      { era: "3.10", innings_pitched: "40.0" },
      [eraCategory],
      { minInningsPitched: 10, mode: "final" },
    );

    expect(result.winner).toBe("teamB");
    expect(result.categories[0].decidedByPolicy).toBe("innings_minimum");
  });

  it("P2-6: live mode tolerates a missing innings_pitched instead of throwing", () => {
    expect(() =>
      compareWeek(
        { era: "-", innings_pitched: "-" },
        { era: "3.10", innings_pitched: "5.0" },
        [eraCategory],
        { minInningsPitched: 10, mode: "live" },
      ),
    ).not.toThrow();
  });

  it("final mode still throws when innings_pitched is missing and no policy applies", () => {
    expect(() =>
      compareWeek(
        { era: "-", innings_pitched: "-" },
        { era: "3.10", innings_pitched: "5.0" },
        [eraCategory],
        { minInningsPitched: 10, mode: "final" },
      ),
    ).toThrow(/data-integrity/);
  });

  it("P3-1: numeric fractional innings_pitched throws instead of silently mis-parsing", () => {
    const ipCategory: WeekStatCategory = {
      slug: "innings_pitched",
      sort_order: "desc",
      is_only_display_stat: false,
    };

    expect(() =>
      compareWeek(
        { innings_pitched: 100.2 },
        { innings_pitched: "100.1" },
        [ipCategory],
        { mode: "final" },
      ),
    ).toThrow(/Ambiguous numeric/);
  });

  it("P3-2: both-sides-missing final data throws instead of a silent tie", () => {
    expect(() =>
      compareWeek({}, {}, [hrCategory], { mode: "final" }),
    ).toThrow(/team A and team B/);
  });

  it("one-sided missing final data still throws (existing H behavior retained)", () => {
    expect(() =>
      compareWeek({ hr: "4" }, {}, [hrCategory], { mode: "final" }),
    ).toThrow(/team B/);
  });

  it("live mode tolerates one-sided missing data as a tie for display", () => {
    const result = compareWeek({ hr: "4" }, {}, [hrCategory], { mode: "live" });
    expect(result.categories[0].winner).toBe("tie");
  });

  it("defaultInningsMinimumPolicy live mode does not apply when IP is absent", () => {
    expect(
      defaultInningsMinimumPolicy({
        category: eraCategory,
        statsA: {},
        statsB: { innings_pitched: "5.0" },
        minInningsPitched: 10,
        mode: "live",
      }),
    ).toEqual({ applies: false });
  });
});

describe("innings minimum forfeits every pitching category", () => {
  // Lander's League, verified against Yahoo's Scoring & Settings page.
  const leaguePitching = ["w", "bb", "k", "era", "whip", "k9", "nsvh"];
  const leagueBatting = ["r", "2b", "3b", "hr", "rbi", "sb", "avg", "ops"];

  const fullCategories = [...leagueBatting, ...leaguePitching].map((slug) => ({
    slug,
    sort_order: slug === "bb" || slug === "era" || slug === "whip" ? "asc" : "desc",
    is_only_display_stat: false,
  })) as WeekStatCategory[];

  function line(innings: string, value: string) {
    return Object.fromEntries([
      ...[...leagueBatting, ...leaguePitching].map((slug) => [slug, value]),
      ["innings_pitched", innings],
    ]);
  }

  it("gives the opponent all seven pitching categories, not just ERA and WHIP", () => {
    // Team B is short. Every pitching value is set so that B would otherwise
    // WIN the category outright, proving the forfeit overrides the comparison
    // rather than merely coinciding with it.
    const short = { ...line("12.0", "50"), bb: "0", era: "0.00", whip: "0.00" };
    const met = { ...line("30.0", "1"), bb: "99", era: "9.99", whip: "9.99" };

    const result = compareWeek(met, short, fullCategories, {
      minInningsPitched: 24,
      mode: "final",
    });

    const forfeited = result.categories
      .filter((c) => c.decidedByPolicy === "innings_minimum")
      .map((c) => [c.slug, c.winner]);

    expect(forfeited).toEqual(leaguePitching.map((slug) => [slug, "teamA"]));
    expect(result.teamAWins).toBeGreaterThanOrEqual(leaguePitching.length);
  });

  it("ties every pitching category when both teams are short", () => {
    const result = compareWeek(
      line("12.0", "5"),
      line("11.0", "9"),
      fullCategories,
      { minInningsPitched: 24, mode: "final" },
    );

    expect(
      result.categories
        .filter((c) => c.decidedByPolicy === "innings_minimum")
        .map((c) => [c.slug, c.winner]),
    ).toEqual(leaguePitching.map((slug) => [slug, "tie"]));
  });

  it("leaves batting categories alone", () => {
    const result = compareWeek(
      { ...line("30.0", "1"), r: "1" },
      { ...line("12.0", "9"), r: "9" },
      fullCategories,
      { minInningsPitched: 24, mode: "final" },
    );

    const batting = result.categories.filter((c) =>
      leagueBatting.includes(c.slug),
    );

    expect(batting.every((c) => c.decidedByPolicy === undefined)).toBe(true);
    expect(batting.find((c) => c.slug === "r")?.winner).toBe("teamB");
  });

  it("the forfeit list matches the league's scored pitching categories", () => {
    // Drift guard: if a category is renamed, added or removed in the seed,
    // this fails rather than silently narrowing the forfeit (which is exactly
    // how ["era","whip"] mis-scored Round 1 of the 2026 bowl).
    expect([...forfeitsAllPitching].sort()).toEqual([...leaguePitching].sort());

    const scored = SEEDED_LEAGUE_SETTINGS.statCategories
      .filter((c) => !c.is_only_display_stat)
      .map((c) => c.slug);

    for (const slug of leaguePitching) {
      expect(scored).toContain(slug);
    }
    expect(scored).toHaveLength(leagueBatting.length + leaguePitching.length);
  });

  it("does not apply when both teams meet the minimum", () => {
    const result = compareWeek(
      line("30.0", "5"),
      line("25.0", "5"),
      fullCategories,
      { minInningsPitched: 24, mode: "final" },
    );

    expect(
      result.categories.some((c) => c.decidedByPolicy !== undefined),
    ).toBe(false);
  });

  it("still does not apply mid-week in live mode", () => {
    const decision = defaultInningsMinimumPolicy({
      category: { slug: "k", sort_order: "desc", is_only_display_stat: false },
      statsA: { innings_pitched: "" },
      statsB: { innings_pitched: "" },
      minInningsPitched: 24,
      mode: "live",
    });

    expect(decision.applies).toBe(false);
  });
});
