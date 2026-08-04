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
      teams: Array.from({ length: 16 }, (_, index) => leagueTeam(index + 1)),
      matchups: [],
    });

    expect(html).toContain("Race to the Bottom");
    expect(html).toContain("Current Standings");
    expect(html).toContain("Round 1 Pairings");
    expect(html).not.toContain("Loser Bowl Bracket");
  });

  it("renders the seven-slot bracket instead of race standings during bracket phase", () => {
    const html = render({
      status: "ready",
      phase: "bracket",
      lastSuccessAt: new Date("2026-09-08T18:30:00.000Z"),
      teams: Array.from({ length: 16 }, (_, index) => leagueTeam(index + 1)),
      matchups: [matchup()],
    });

    expect(html).toContain("Loser Bowl Bracket");
    expect(html).toContain("r1m1");
    expect(html).toContain("r2m1");
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
    expect(html).toContain("Full Bracket");
  });
});
