import { describe, expect, it } from "vitest";

import {
  buildBracketSlots,
  categoryStatLines,
  displayTally,
  formatDecidedBy,
  formatTally,
  isLiveMatchup,
  liveLeader,
  matchupStatusView,
  parseComputedTally,
  resultExplanation,
  type PublicComputedTally,
  type PublicLiveTally,
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
    liveTally: null,
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

describe("live tally (manual-mode mid-week view)", () => {
  const liveTally: PublicLiveTally = {
    teamAId: highTeam.id,
    teamBId: lowTeam.id,
    teamAWins: 4,
    teamBWins: 6,
    tiedCategories: 5,
    categoryWinner: "teamB",
    leaderTeamId: lowTeam.id,
    asOf: new Date("2026-09-08T01:00:00.000Z"),
    categories: [
      { slug: "hr", winner: "teamA", teamAValue: 8, teamBValue: 5 },
      { slug: "era", winner: "teamB", teamAValue: 4.1, teamBValue: 3.21 },
      { slug: "whip", winner: "tie", teamAValue: null, teamBValue: 1.2 },
    ],
  };

  function liveMatchup(overrides: Partial<PublicMatchup> = {}): PublicMatchup {
    return matchup({
      status: "pending",
      computedWinner: null,
      computedTally: null,
      decidedBy: null,
      lockedAt: null,
      settledAt: null,
      liveTally,
      ...overrides,
    });
  }

  it("treats a pending matchup with a live tally as live", () => {
    expect(isLiveMatchup(liveMatchup())).toBe(true);
    expect(isLiveMatchup(liveMatchup({ liveTally: null }))).toBe(false);
    expect(matchupStatusView(liveMatchup())).toMatchObject({
      label: "live",
      tone: "rose",
    });
    expect(matchupStatusView({ status: "pending" })).toMatchObject({
      label: "pending",
    });
  });

  it("renders the live tally and stat lines high-low like a computed one", () => {
    expect(displayTally(liveMatchup())?.kind).toBe("live");
    expect(formatTally(liveMatchup())).toBe("4-6-5");

    const rows = categoryStatLines(liveMatchup(), [
      { slug: "hr", display_name: "HR", is_only_display_stat: false },
      { slug: "era", display_name: "ERA", is_only_display_stat: false },
      { slug: "whip", display_name: "WHIP", is_only_display_stat: false },
    ]);

    expect(rows.map((row) => [row.label, row.highValue, row.lowValue, row.winner])).toEqual([
      ["HR", "8", "5", "high"],
      ["ERA", "4.10", "3.21", "low"],
      ["WHIP", "-", "1.20", "tie"],
    ]);
  });

  it("prefers the engine's computed tally when both exist", () => {
    const decided = matchup({ status: "provisional", liveTally });

    expect(displayTally(decided)?.kind).toBe("computed");
    expect(formatTally(decided)).toBe("5-4-1");
    expect(isLiveMatchup(decided)).toBe(false);
  });

  it("names the leader, or nobody on a category tie", () => {
    expect(liveLeader(liveMatchup())?.id).toBe(lowTeam.id);
    expect(
      liveLeader(
        liveMatchup({ liveTally: { ...liveTally, leaderTeamId: null } }),
      ),
    ).toBeNull();
    expect(resultExplanation(liveMatchup())).toBe(
      "Live: Sixteen Candles leads 4-6-5. Updates with each stats import; nothing is decided until the week closes.",
    );
    expect(
      resultExplanation(
        liveMatchup({
          liveTally: { ...liveTally, teamAWins: 5, teamBWins: 5, categoryWinner: "tie", leaderTeamId: null },
        }),
      ),
    ).toBe(
      "Live: tied 5-5-5. Updates with each stats import; nothing is decided until the week closes.",
    );
  });
});
