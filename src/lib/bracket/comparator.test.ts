import { describe, expect, it } from "vitest";

import type { WeekStatCategory } from "./comparator";
import {
  compareWeek,
  defaultInningsMinimumPolicy,
} from "./comparator";

const categories = [
  {
    slug: "hr",
    display_name: "HR",
    sort_order: "desc",
    is_only_display_stat: false,
  },
  {
    slug: "avg",
    display_name: "AVG",
    sort_order: "desc",
    is_only_display_stat: false,
  },
  {
    slug: "era",
    display_name: "ERA",
    sort_order: "asc",
    is_only_display_stat: false,
  },
  {
    slug: "whip",
    display_name: "WHIP",
    sort_order: "asc",
    is_only_display_stat: false,
  },
  {
    slug: "innings_pitched",
    display_name: "IP",
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
      { era: "1.00", whip: "1.00", innings_pitched: "0.0" },
      { era: "9.00", whip: "9.00", innings_pitched: "99.0" },
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
