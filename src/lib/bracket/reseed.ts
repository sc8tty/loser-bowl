export type SeededTeam = {
  id: string;
  seed: number;
};

export type NextRoundPairing<TTeam extends SeededTeam> = {
  label: string;
  highSeed: number;
  lowSeed: number;
  highTeam: TTeam;
  lowTeam: TTeam;
};

export function nextRoundPairings<TTeam extends SeededTeam>(
  aliveTeams: readonly TTeam[],
): NextRoundPairing<TTeam>[] {
  if (aliveTeams.length % 2 !== 0) {
    throw new Error("nextRoundPairings requires an even number of alive teams");
  }

  const sortedAliveTeams = [...aliveTeams].sort((a, b) => a.seed - b.seed);
  const pairings: NextRoundPairing<TTeam>[] = [];

  for (let index = 0; index < sortedAliveTeams.length / 2; index += 1) {
    const highTeam = sortedAliveTeams[index];
    const lowTeam = sortedAliveTeams[sortedAliveTeams.length - 1 - index];

    pairings.push({
      label: `${highTeam.seed}v${lowTeam.seed}`,
      highSeed: highTeam.seed,
      lowSeed: lowTeam.seed,
      highTeam,
      lowTeam,
    });
  }

  return pairings;
}
