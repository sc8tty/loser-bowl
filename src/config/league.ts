export type BowlRound = {
  round: 1 | 2 | 3;
  week: number;
  start: string;
  end: string;
};

export const LEAGUE_CONFIG = {
  season: 2026,
  timeZone: "America/Los_Angeles",
  bracketLockDate: "2026-09-06",
  rounds: [
    { round: 1, week: 23, start: "2026-09-07", end: "2026-09-13" },
    { round: 2, week: 24, start: "2026-09-14", end: "2026-09-20" },
    { round: 3, week: 25, start: "2026-09-21", end: "2026-09-27" },
  ],
  bowlSeeds: [9, 10, 11, 12, 13, 14, 15, 16],
  leagueKey: process.env.LEAGUE_KEY ?? null,
} as const satisfies {
  season: number;
  timeZone: string;
  bracketLockDate: string;
  rounds: readonly BowlRound[];
  bowlSeeds: readonly number[];
  leagueKey: string | null;
};

// Derived from bowlSeeds (best vs worst, walking inward): 9v16, 10v15, 11v14, 12v13.
// One edit point for config-for-reuse — change bowlSeeds and the pairs follow.
export const LOSER_BOWL_ROUND_ONE_SEED_PAIRS: readonly (readonly [
  number,
  number,
])[] = LEAGUE_CONFIG.bowlSeeds
  .slice(0, LEAGUE_CONFIG.bowlSeeds.length / 2)
  .map((seed, index) => [
    seed,
    LEAGUE_CONFIG.bowlSeeds[LEAGUE_CONFIG.bowlSeeds.length - 1 - index],
  ] as const);
