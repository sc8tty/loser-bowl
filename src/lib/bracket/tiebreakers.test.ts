import { describe, expect, it } from "vitest";

import { applyTiebreakers } from "./tiebreakers";

const tiedMatchup = {
  teamAId: "team-a",
  teamBId: "team-b",
  teamAWins: 5,
  teamBWins: 5,
};

describe("applyTiebreakers", () => {
  it("returns the category winner before consulting tiebreakers", () => {
    expect(
      applyTiebreakers(
        { ...tiedMatchup, teamAWins: 6, teamBWins: 4 },
        {
          regularSeasonMatchups: [],
          outcomeTotalsByTeamId: {},
          seedsByTeamId: { "team-a": 16, "team-b": 9 },
        },
      ),
    ).toEqual({ winnerTeamId: "team-a", decidedBy: "categories" });
  });

  it("uses the canonical season head-to-head winner series first", () => {
    expect(
      applyTiebreakers(tiedMatchup, {
        regularSeasonMatchups: [
          { teamAId: "team-a", teamBId: "team-b", winnerTeamId: "team-a" },
          { teamAId: "team-a", teamBId: "team-b", winnerTeamId: "team-a" },
        ],
        outcomeTotalsByTeamId: {
          "team-a": { category_wins: 80 },
          "team-b": { category_wins: 90 },
        },
        seedsByTeamId: { "team-a": 16, "team-b": 9 },
      }),
    ).toEqual({ winnerTeamId: "team-a", decidedBy: "h2h_series" });
  });

  it("handles one meeting and team order independent regular-season rows", () => {
    expect(
      applyTiebreakers(tiedMatchup, {
        regularSeasonMatchups: [
          { teamAId: "team-b", teamBId: "team-a", winnerTeamId: "team-b" },
        ],
        outcomeTotalsByTeamId: {
          "team-a": { category_wins: 90 },
          "team-b": { category_wins: 80 },
        },
        seedsByTeamId: { "team-a": 9, "team-b": 16 },
      }),
    ).toEqual({ winnerTeamId: "team-b", decidedBy: "h2h_series" });
  });

  it("falls through from split or tied head-to-head meetings to season category wins", () => {
    expect(
      applyTiebreakers(tiedMatchup, {
        regularSeasonMatchups: [
          { teamAId: "team-a", teamBId: "team-b", winnerTeamId: "team-a" },
          { teamAId: "team-a", teamBId: "team-b", winnerTeamId: "team-b" },
          { teamAId: "team-a", teamBId: "team-b", winnerTeamId: null },
        ],
        outcomeTotalsByTeamId: {
          "team-a": { category_wins: 91 },
          "team-b": { category_wins: 90 },
        },
        seedsByTeamId: { "team-a": 16, "team-b": 9 },
      }),
    ).toEqual({ winnerTeamId: "team-a", decidedBy: "season_cat_wins" });
  });

  it("falls through from zero meetings to season category wins", () => {
    expect(
      applyTiebreakers(tiedMatchup, {
        regularSeasonMatchups: [],
        outcomeTotalsByTeamId: {
          "team-a": { category_wins: 88 },
          "team-b": { category_wins: 89 },
        },
        seedsByTeamId: { "team-a": 9, "team-b": 16 },
      }),
    ).toEqual({ winnerTeamId: "team-b", decidedBy: "season_cat_wins" });
  });

  it("uses the numerically lower seed as the deterministic terminus", () => {
    expect(
      applyTiebreakers(tiedMatchup, {
        regularSeasonMatchups: [],
        outcomeTotalsByTeamId: {
          "team-a": { category_wins: 88 },
          "team-b": { category_wins: 88 },
        },
        seedsByTeamId: { "team-a": 12, "team-b": 13 },
      }),
    ).toEqual({ winnerTeamId: "team-a", decidedBy: "seed" });
  });
});

// Regression tests for the 2026-08-02 cold review (finding F: garbage tiebreak input).
describe("applyTiebreakers rejects corrupt context instead of silently proceeding", () => {
  it("throws when a matchup's category-win counts are missing", () => {
    expect(() =>
      applyTiebreakers(
        { teamAId: "team-a", teamBId: "team-b" },
        {
          regularSeasonMatchups: [],
          outcomeTotalsByTeamId: {},
          seedsByTeamId: { "team-a": 9, "team-b": 16 },
        },
      ),
    ).toThrow(/missing category win counts/);
  });

  it("throws when a regular-season row names a winner outside the pair", () => {
    expect(() =>
      applyTiebreakers(tiedMatchup, {
        regularSeasonMatchups: [
          { teamAId: "team-a", teamBId: "team-b", winnerTeamId: "team-z" },
        ],
        outcomeTotalsByTeamId: {},
        seedsByTeamId: { "team-a": 9, "team-b": 16 },
      }),
    ).toThrow(/neither team/);
  });

  it("throws when season category-win totals are missing rather than skipping to seed", () => {
    expect(() =>
      applyTiebreakers(tiedMatchup, {
        regularSeasonMatchups: [],
        outcomeTotalsByTeamId: { "team-a": { category_wins: 90 } },
        seedsByTeamId: { "team-a": 9, "team-b": 16 },
      }),
    ).toThrow(/missing season category-win totals/);
  });
});
