import { describe, expect, it } from "vitest";

import { computeLiveTally, isLiveTallyEligible } from "./liveTally";

const config = {
  timeZone: "America/Los_Angeles",
  rounds: [
    { round: 1 as const, week: 24, start: "2026-09-07", end: "2026-09-13" },
    { round: 2 as const, week: 25, start: "2026-09-14", end: "2026-09-20" },
    { round: 3 as const, week: 26, start: "2026-09-21", end: "2026-09-27" },
  ],
};

const categories = [
  { slug: "hr", sort_order: "desc" as const, is_only_display_stat: false },
  { slug: "sb", sort_order: "desc" as const, is_only_display_stat: false },
  { slug: "avg", sort_order: "desc" as const, is_only_display_stat: false },
  { slug: "era", sort_order: "asc" as const, is_only_display_stat: false },
  { slug: "whip", sort_order: "asc" as const, is_only_display_stat: false },
  {
    slug: "innings_pitched",
    sort_order: "desc" as const,
    is_only_display_stat: true,
  },
];

const leagueSettings = { statCategories: categories };

const matchup = {
  round: 1 as const,
  week: 24,
  status: "pending",
  highTeamId: "slump-busters",
  lowTeamId: "baseball-furries",
};

// Mid-week, day 2 of Week 24, league time.
const now = new Date("2026-09-08T19:00:00.000Z");

function line(
  teamId: string,
  stats: Record<string, string | number>,
  syncedAt?: string,
) {
  return {
    teamId,
    week: 24,
    stats,
    syncedAt: syncedAt === undefined ? null : new Date(syncedAt),
  };
}

describe("isLiveTallyEligible", () => {
  it("is eligible for a pending matchup with both teams once its week starts", () => {
    expect(isLiveTallyEligible(matchup, now, config)).toBe(true);
  });

  it("is not eligible before the round's start date in league time", () => {
    // 2026-09-07T05:00Z is still Sep 6 in Los Angeles.
    const beforeStart = new Date("2026-09-07T05:00:00.000Z");

    expect(isLiveTallyEligible(matchup, beforeStart, config)).toBe(false);
  });

  it("stays eligible after the week ends until the engine records a result", () => {
    const afterEnd = new Date("2026-09-15T19:00:00.000Z");

    expect(isLiveTallyEligible(matchup, afterEnd, config)).toBe(true);
  });

  it("is never eligible once the engine owns the matchup", () => {
    for (const status of ["provisional", "under_review", "final"]) {
      expect(isLiveTallyEligible({ ...matchup, status }, now, config)).toBe(false);
    }
  });

  it("is not eligible with a TBD side", () => {
    expect(
      isLiveTallyEligible({ ...matchup, lowTeamId: null }, now, config),
    ).toBe(false);
  });
});

describe("computeLiveTally", () => {
  it("compares the two teams' stat lines for the matchup week without deciding", () => {
    const tally = computeLiveTally({
      matchup,
      statLines: [
        line(
          "slump-busters",
          { hr: 5, sb: 2, avg: ".270", era: "3.10", whip: "1.20", innings_pitched: "10.1" },
          "2026-09-08T18:00:00.000Z",
        ),
        line(
          "baseball-furries",
          { hr: 3, sb: 2, avg: ".300", era: "4.00", whip: "1.10", innings_pitched: "30.0" },
          "2026-09-08T18:05:00.000Z",
        ),
      ],
      leagueSettings,
      now,
      config,
    });

    expect(tally).not.toBeNull();
    expect(tally).toMatchObject({
      teamAId: "slump-busters",
      teamBId: "baseball-furries",
      teamAWins: 2,
      teamBWins: 2,
      tiedCategories: 1,
      categoryWinner: "tie",
      leaderTeamId: null,
    });
    expect(tally?.asOf?.toISOString()).toBe("2026-09-08T18:05:00.000Z");
    expect(tally?.categories.map((category) => category.slug)).toEqual([
      "hr",
      "sb",
      "avg",
      "era",
      "whip",
    ]);
  });

  it("names the leader when one side wins more categories", () => {
    const tally = computeLiveTally({
      matchup,
      statLines: [
        line("slump-busters", { hr: 5, sb: 4, avg: ".270", era: "3.10", whip: "1.20" }),
        line("baseball-furries", { hr: 3, sb: 2, avg: ".260", era: "4.00", whip: "1.30" }),
      ],
      leagueSettings,
      now,
      config,
    });

    expect(tally?.leaderTeamId).toBe("slump-busters");
    expect(tally?.teamAWins).toBe(5);
    expect(tally?.asOf).toBeNull();
  });

  it("does not apply the innings minimum mid-week", () => {
    // Both teams below 24 IP: the final-mode policy would force ERA/WHIP ties
    // and flag them; live view compares the ratios as Yahoo shows them.
    const tally = computeLiveTally({
      matchup,
      statLines: [
        line("slump-busters", { hr: 1, sb: 1, avg: ".250", era: "2.00", whip: "1.00", innings_pitched: "6.0" }),
        line("baseball-furries", { hr: 1, sb: 1, avg: ".250", era: "5.00", whip: "1.50", innings_pitched: "4.2" }),
      ],
      leagueSettings,
      now,
      config,
    });

    const era = tally?.categories.find((category) => category.slug === "era");

    expect(era?.winner).toBe("teamA");
    expect(era?.decidedByPolicy).toBeUndefined();
    expect(tally?.leaderTeamId).toBe("slump-busters");
  });

  it("treats Yahoo's '-' placeholder as a tie instead of throwing", () => {
    const tally = computeLiveTally({
      matchup,
      statLines: [
        line("slump-busters", { hr: 2, sb: 0, avg: ".250", era: "-", whip: "-" }),
        line("baseball-furries", { hr: 1, sb: 0, avg: ".200", era: "3.00", whip: "1.10" }),
      ],
      leagueSettings,
      now,
      config,
    });

    expect(tally).toMatchObject({ teamAWins: 2, teamBWins: 0, tiedCategories: 3 });
  });

  it("returns null when either team's stat line for the week is missing", () => {
    expect(
      computeLiveTally({
        matchup,
        statLines: [line("slump-busters", { hr: 2 })],
        leagueSettings,
        now,
        config,
      }),
    ).toBeNull();
  });

  it("ignores stat lines from other weeks", () => {
    expect(
      computeLiveTally({
        matchup,
        statLines: [
          { ...line("slump-busters", { hr: 2 }), week: 23 },
          line("baseball-furries", { hr: 1 }),
        ],
        leagueSettings,
        now,
        config,
      }),
    ).toBeNull();
  });
});
