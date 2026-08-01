import { describe, expect, it } from "vitest";

import { nextRoundPairings } from "./reseed";

const roundOneSeeds = [
  [9, 16],
  [10, 15],
  [11, 14],
  [12, 13],
] as const;

const cases = Array.from({ length: 16 }, (_, mask) => {
  const aliveSeeds = roundOneSeeds.map(([highSeed, lowSeed], index) =>
    mask & (1 << index) ? lowSeed : highSeed,
  );
  const sorted = [...aliveSeeds].sort((a, b) => a - b);

  return {
    label: aliveSeeds.join(","),
    aliveSeeds,
    expected: [
      [sorted[0], sorted[3]],
      [sorted[1], sorted[2]],
    ],
  };
});

const team = (seed: number) => ({
  id: `team-${seed}`,
  seed,
  name: `Seed ${seed}`,
});

describe("nextRoundPairings", () => {
  it.each(cases)(
    "re-seeds semifinal pairings for R1 winners %s",
    ({ aliveSeeds, expected }) => {
      expect(
        nextRoundPairings(aliveSeeds.map(team)).map((pairing) => [
          pairing.highSeed,
          pairing.lowSeed,
        ]),
      ).toEqual(expected);
    },
  );

  it("re-seeds the finals from the two semifinal winners", () => {
    expect(
      nextRoundPairings([team(12), team(9)]).map((pairing) => [
        pairing.highSeed,
        pairing.lowSeed,
      ]),
    ).toEqual([[9, 12]]);
  });

  it("rejects odd numbers of alive teams", () => {
    expect(() => nextRoundPairings([team(9), team(10), team(11)])).toThrow(
      /even/i,
    );
  });
});
