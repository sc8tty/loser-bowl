import { LOSER_BOWL_ROUND_ONE_SEED_PAIRS } from "@/config/league";

export type RankedTeam = {
  id: string;
  name: string;
  currentRank: number;
};

export type ProjectedPairing<TTeam extends RankedTeam> = {
  label: string;
  highSeed: number;
  lowSeed: number;
  highTeam: TTeam;
  lowTeam: TTeam;
};

export function getProjectedRoundOnePairings<TTeam extends RankedTeam>(
  teams: readonly TTeam[],
): ProjectedPairing<TTeam>[] {
  const teamsByRank = new Map<number, TTeam>();

  for (const team of teams) {
    teamsByRank.set(team.currentRank, team);
  }

  return LOSER_BOWL_ROUND_ONE_SEED_PAIRS.flatMap(([highSeed, lowSeed]) => {
    const highTeam = teamsByRank.get(highSeed);
    const lowTeam = teamsByRank.get(lowSeed);

    if (!highTeam || !lowTeam) {
      return [];
    }

    return [
      {
        label: `${highSeed}v${lowSeed}`,
        highSeed,
        lowSeed,
        highTeam,
        lowTeam,
      },
    ];
  });
}
