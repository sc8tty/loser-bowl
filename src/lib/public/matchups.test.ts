import { describe, expect, it } from "vitest";

import {
  buildBracketSlots,
  categoryStatLines,
  formatDecidedBy,
  formatTally,
  matchupStatusView,
  parseComputedTally,
  resultExplanation,
  type PublicComputedTally,
  type PublicMatchup,
  type PublicTeamRef,
} from "./matchups";

function team(id: string, name: string, finalSeed: number): PublicTeamRef {
  return {
    id,
    name,
    currentRank: finalSeed,
    finalSeed,
  };
}

const highTeam = team("team-9", "Ninth Place", 9);
const lowTeam = team("team-16", "Sixteen Candles", 16);

const tally: PublicComputedTally = {
  teamAId: highTeam.id,
  teamBId: lowTeam.id,
  teamAWins: 5,
  teamBWins: 4,
  tiedCategories: 1,
  categoryWinner: "teamA",
  computedWinnerTeamId: highTeam.id,
  decidedBy: "categories",
  categories: [
    {
      slug: "hr",
      winner: "teamA",
      teamAValue: 8,
      teamBValue: 5,
    },
    {
      slug: "era",
      winner: "teamB",
      teamAValue: 4.1,
      teamBValue: 3.21,
    },
    {
      slug: "avg",
      winner: "tie",
      teamAValue: 0.275,
      teamBValue: 0.275,
    },
    {
      slug: "whip",
      winner: "teamA",
      teamAValue: 1.09,
      teamBValue: 1.33,
      decidedByPolicy: "innings_minimum",
    },
  ],
};

function matchup(
  overrides: Partial<PublicMatchup> = {},
): PublicMatchup {
  return {
    id: "r1m1",
    round: 1,
    week: 23,
    status: "final",
    highTeam,
    lowTeam,
    computedWinner: highTeam,
    overrideWinner: null,
    computedTally: tally,
    decidedBy: "categories",
    lockedAt: new Date("2026-09-14T06:00:00.000Z"),
    settledAt: new Date("2026-09-15T06:00:00.000Z"),
    overrideNote: null,
    overriddenAt: null,
    ...overrides,
  };
}

describe("public matchup helpers", () => {
  it("fills the fixed seven-slot bracket with TBD placeholders for missing rows", () => {
    const slots = buildBracketSlots([matchup()]);

    expect(slots).toHaveLength(7);
    expect(slots.map((slot) => slot.id)).toEqual([
      "r1m1",
      "r1m2",
      "r1m3",
      "r1m4",
      "r2m1",
      "r2m2",
      "final",
    ]);
    expect(slots.find((slot) => slot.id === "r1m1")?.exists).toBe(true);
    expect(slots.find((slot) => slot.id === "r2m1")).toMatchObject({
      exists: false,
      highTeam: null,
      lowTeam: null,
      status: "pending",
    });
  });

  it("marks downstream slots with commissioner review when an upstream result is frozen", () => {
    const slots = buildBracketSlots([
      matchup({ status: "under_review" }),
      matchup({
        id: "r2m1",
        round: 2,
        week: 24,
        status: "pending",
        highTeam: null,
        lowTeam: null,
        computedWinner: null,
        computedTally: null,
        decidedBy: null,
      }),
    ]);
    const reviewSlot = slots.find((slot) => slot.id === "r1m1");
    const downstreamSlot = slots.find((slot) => slot.id === "r2m1");

    expect(matchupStatusView(reviewSlot!, false)).toMatchObject({
      label: "under review",
      tone: "rose",
      bannerTitle: "Commissioner review",
    });
    expect(downstreamSlot?.upstreamUnderReview).toBe(true);
    expect(matchupStatusView(downstreamSlot!, true)).toMatchObject({
      label: "commissioner review",
      tone: "amber",
    });
  });

  it("formats tallies from the displayed high-vs-low perspective", () => {
    expect(formatTally(matchup())).toBe("5-4-1");
    expect(
      formatTally(
        matchup({
          highTeam: lowTeam,
          lowTeam: highTeam,
        }),
      ),
    ).toBe("4-5-1");
  });

  it("renders category stat lines with display labels, baseball value formatting, and policy labels", () => {
    expect(
      categoryStatLines(matchup(), [
        { slug: "hr", display_name: "HR", is_only_display_stat: false },
        { slug: "era", display_name: "ERA", is_only_display_stat: false },
        { slug: "avg", display_name: "AVG", is_only_display_stat: false },
        { slug: "whip", display_name: "WHIP", is_only_display_stat: false },
      ]),
    ).toEqual([
      {
        slug: "hr",
        label: "HR",
        highValue: "8",
        lowValue: "5",
        winner: "high",
        policyLabel: null,
      },
      {
        slug: "era",
        label: "ERA",
        highValue: "4.10",
        lowValue: "3.21",
        winner: "low",
        policyLabel: null,
      },
      {
        slug: "avg",
        label: "AVG",
        highValue: ".275",
        lowValue: ".275",
        winner: "tie",
        policyLabel: null,
      },
      {
        slug: "whip",
        label: "WHIP",
        highValue: "1.09",
        lowValue: "1.33",
        winner: "high",
        policyLabel: "IP minimum",
      },
    ]);
  });

  it("parses the authoritative computed tally snapshot and rejects malformed data", () => {
    expect(parseComputedTally(tally)).toEqual(tally);
    expect(parseComputedTally({ ...tally, teamAWins: "5" })).toBeNull();
  });

  it("explains decided-by and result lifecycle states in public language", () => {
    expect(formatDecidedBy("h2h_series")).toBe("head-to-head tiebreaker");
    expect(formatDecidedBy("season_cat_wins")).toBe("season category wins");
    expect(formatDecidedBy("seed")).toBe("higher seed");
    expect(resultExplanation(matchup({ status: "provisional" }))).toContain(
      "inside the stat-correction window",
    );
    expect(resultExplanation(matchup({ status: "under_review" }))).toContain(
      "Commissioner review",
    );
    expect(resultExplanation(matchup({ computedTally: null }))).toBe(
      "Result not yet computed.",
    );
  });
});
