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
  const teamsByRank = new Map<number, TTeam[]>();

  for (const team of teams) {
    const rankedTeams = teamsByRank.get(team.currentRank) ?? [];
    rankedTeams.push(team);
    teamsByRank.set(team.currentRank, rankedTeams);
  }

  return LOSER_BOWL_ROUND_ONE_SEED_PAIRS.flatMap(([highSeed, lowSeed]) => {
    const highTeams = teamsByRank.get(highSeed) ?? [];
    const lowTeams = teamsByRank.get(lowSeed) ?? [];

    if (highTeams.length !== 1 || lowTeams.length !== 1) {
      return [];
    }

    const [highTeam] = highTeams;
    const [lowTeam] = lowTeams;

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
