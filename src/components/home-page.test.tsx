import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomePage } from "./home-page";
import type { LeagueData } from "@/lib/sync/trigger";
import type { PublicComputedTally, PublicMatchup, PublicTeamRef } from "@/lib/public/matchups";

function leagueTeam(seed: number) {
  return {
    id: `team-${seed}`,
    name: `Team ${seed}`,
    currentRank: seed,
    wins: 80 - seed,
    losses: 50 + seed,
    ties: seed % 3,
  };
}

function publicTeam(seed: number): PublicTeamRef {
  return {
    id: `team-${seed}`,
    name: `Team ${seed}`,
    currentRank: seed,
    finalSeed: seed,
    record: { wins: 80 - seed, losses: 50 + seed, ties: seed % 3 },
  };
}

function computedTally(teamA: PublicTeamRef, teamB: PublicTeamRef): PublicComputedTally {
  return {
    teamAId: teamA.id,
    teamBId: teamB.id,
    teamAWins: 6,
    teamBWins: 3,
    tiedCategories: 1,
    categoryWinner: "teamA",
    computedWinnerTeamId: teamA.id,
    decidedBy: "categories",
    categories: [
      {
        slug: "hr",
        winner: "teamA",
        teamAValue: 8,
        teamBValue: 5,
      },
    ],
  };
}

function matchup(overrides: Partial<PublicMatchup> = {}): PublicMatchup {
  const highTeam = publicTeam(9);
  const lowTeam = publicTeam(16);

  return {
    id: "r1m1",
    round: 1,
    week: 23,
    status: "final",
    highTeam,
    lowTeam,
    computedWinner: highTeam,
    overrideWinner: null,
    computedTally: computedTally(highTeam, lowTeam),
    liveTally: null,
    highStats: null,
    lowStats: null,
    decidedBy: "categories",
    lockedAt: new Date("2026-09-14T06:00:00.000Z"),
    settledAt: new Date("2026-09-15T06:00:00.000Z"),
    overrideNote: null,
    overriddenAt: null,
    ...overrides,
  };
}

const now = new Date("2026-09-08T19:00:00.000Z");

function render(data: LeagueData) {
  return renderToStaticMarkup(<HomePage data={data} now={now} />);
}

describe("HomePage phase rendering", () => {
  it("keeps the existing race view for race phase", () => {
    const html = render({
      status: "ready",
      phase: "race",
      lastSuccessAt: new Date("2026-09-08T18:30:00.000Z"),
      lastUpdatedAt: new Date("2026-09-08T18:30:00.000Z"),
      statCategories: [],
      teams: Array.from({ length: 16 }, (_, index) => leagueTeam(index + 1)),
      matchups: [],
    });

    expect(html).toContain("Race to the Bottom");
    expect(html).toContain("Regular Season Standings");
    expect(html).toContain("Round 1 Pairings");
    expect(html).not.toContain("Loser Bowl Bracket");
  });

  it("renders the seven-slot bracket instead of race standings during bracket phase", () => {
    const html = render({
      status: "ready",
      phase: "bracket",
      lastSuccessAt: new Date("2026-09-08T18:30:00.000Z"),
      lastUpdatedAt: new Date("2026-09-08T18:30:00.000Z"),
      statCategories: [],
      teams: Array.from({ length: 16 }, (_, index) => leagueTeam(index + 1)),
      matchups: [matchup()],
    });

    expect(html).toContain("Race to the Bottom");
    expect(html).toContain("Round 1 Matchup 1");
    expect(html).toContain("Semifinal 1");
    expect(html).toContain("H/AB");
    expect(html).toContain(">IP<");
    expect(html).toContain("final");
    expect(html).toContain("TBD");
    expect(html).not.toContain("Current Standings");
  });

  it("renders the champion takeover with a link to the full bracket", () => {
    const finalWinner = publicTeam(9);
    const finalLoser = publicTeam(12);
    const html = render({
      status: "ready",
      phase: "champion",
      lastSuccessAt: new Date("2026-09-29T18:30:00.000Z"),
      lastUpdatedAt: new Date("2026-09-29T18:30:00.000Z"),
      statCategories: [],
      teams: Array.from({ length: 16 }, (_, index) => leagueTeam(index + 1)),
      matchups: [
        matchup({
          id: "final",
          round: 3,
          week: 25,
          status: "final",
          highTeam: finalWinner,
          lowTeam: finalLoser,
          computedWinner: finalWinner,
          computedTally: computedTally(finalWinner, finalLoser),
        }),
      ],
    });

    expect(html).toContain("Lander&#x27;s League Loser Bowl Champion");
    expect(html).toContain("Team 9");
    expect(html).toContain("View the full bracket");
    expect(html).toContain('id="full-bracket"');
    expect(html).toContain("Semifinal 1");
  });
});

describe("HomePage live tally cards", () => {
  it("shows the live tally, leader, and live badge for an in-progress matchup", () => {
    const highTeam = publicTeam(9);
    const lowTeam = publicTeam(16);
    const html = render({
      status: "ready",
      phase: "bracket",
      teams: [leagueTeam(9), leagueTeam(16)],
      lastSuccessAt: null,
      lastUpdatedAt: new Date("2026-09-08T18:45:00.000Z"),
      statCategories: [],
      matchups: [
        matchup({
          status: "pending",
          computedWinner: null,
          computedTally: null,
          decidedBy: null,
          lockedAt: null,
          settledAt: null,
          liveTally: {
            teamAId: highTeam.id,
            teamBId: lowTeam.id,
            teamAWins: 7,
            teamBWins: 5,
            tiedCategories: 3,
            categoryWinner: "teamA",
            leaderTeamId: highTeam.id,
            asOf: new Date("2026-09-08T18:40:00.000Z"),
            categories: [],
          },
        }),
      ],
    });

    expect(html).toContain('data-tally="7-5-3"');
    expect(html).not.toContain(">live<");
    expect(html).not.toContain("Matchup detail");
    expect(html).toContain("15 min ago");
    expect(html).toContain("Sep 8, 11:45 AM PDT");
  });

  it("does not paint TBD slots or live (undecided) teams as winners", () => {
    const html = render({
      status: "ready",
      phase: "bracket",
      teams: [leagueTeam(9), leagueTeam(16)],
      lastSuccessAt: null,
      lastUpdatedAt: null,
      statCategories: [],
      matchups: [
        matchup({ status: "pending", computedWinner: null, computedTally: null, decidedBy: null }),
      ],
    });

    // No winner anywhere on the page: every slot is either a real undecided
    // team or a TBD placeholder, and neither may get the emerald winner box.
    expect(html).not.toContain("bg-emerald-800");
  });
});
