import { describe, expect, it } from "vitest";

import { getProjectedRoundOnePairings } from "./bracket";

const rankedTeams = [
  { id: "team-16", name: "Sixteen", currentRank: 16 },
  { id: "team-1", name: "One", currentRank: 1 },
  { id: "team-9", name: "Nine", currentRank: 9 },
  { id: "team-12", name: "Twelve", currentRank: 12 },
  { id: "team-15", name: "Fifteen", currentRank: 15 },
  { id: "team-10", name: "Ten", currentRank: 10 },
  { id: "team-14", name: "Fourteen", currentRank: 14 },
  { id: "team-11", name: "Eleven", currentRank: 11 },
  { id: "team-13", name: "Thirteen", currentRank: 13 },
];

describe("getProjectedRoundOnePairings", () => {
  it("projects the loser-bowl round one matchups from current ranks", () => {
    expect(getProjectedRoundOnePairings(rankedTeams)).toEqual([
      {
        label: "9v16",
        highSeed: 9,
        lowSeed: 16,
        highTeam: { id: "team-9", name: "Nine", currentRank: 9 },
        lowTeam: { id: "team-16", name: "Sixteen", currentRank: 16 },
      },
      {
        label: "10v15",
        highSeed: 10,
        lowSeed: 15,
        highTeam: { id: "team-10", name: "Ten", currentRank: 10 },
        lowTeam: { id: "team-15", name: "Fifteen", currentRank: 15 },
      },
      {
        label: "11v14",
        highSeed: 11,
        lowSeed: 14,
        highTeam: { id: "team-11", name: "Eleven", currentRank: 11 },
        lowTeam: { id: "team-14", name: "Fourteen", currentRank: 14 },
      },
      {
        label: "12v13",
        highSeed: 12,
        lowSeed: 13,
        highTeam: { id: "team-12", name: "Twelve", currentRank: 12 },
        lowTeam: { id: "team-13", name: "Thirteen", currentRank: 13 },
      },
    ]);
  });

  it("omits incomplete pairings when standings data has not arrived yet", () => {
    expect(
      getProjectedRoundOnePairings([
        { id: "team-9", name: "Nine", currentRank: 9 },
        { id: "team-16", name: "Sixteen", currentRank: 16 },
        { id: "team-10", name: "Ten", currentRank: 10 },
      ]),
    ).toEqual([
      {
        label: "9v16",
        highSeed: 9,
        lowSeed: 16,
        highTeam: { id: "team-9", name: "Nine", currentRank: 9 },
        lowTeam: { id: "team-16", name: "Sixteen", currentRank: 16 },
      },
    ]);
  });

  it("omits pairings when a projected seed rank is ambiguous", () => {
    expect(
      getProjectedRoundOnePairings([
        { id: "team-9-a", name: "Nine A", currentRank: 9 },
        { id: "team-9-b", name: "Nine B", currentRank: 9 },
        { id: "team-16", name: "Sixteen", currentRank: 16 },
      ]),
    ).toEqual([]);
  });
});
