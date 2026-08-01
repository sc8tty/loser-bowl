import type { ProjectedPairing, RankedTeam } from "@/lib/bracket";

export function ProjectedPairings<TTeam extends RankedTeam>({
  pairings,
}: {
  pairings: readonly ProjectedPairing<TTeam>[];
}) {
  if (pairings.length === 0) {
    return (
      <div className="border border-dashed border-stone-300 bg-white px-4 py-6 text-sm text-stone-600">
        Projected pairings will appear once seeds 9-16 are available.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {pairings.map((pairing) => (
        <article
          key={pairing.label}
          className="border border-stone-300 bg-white p-4"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-stone-950">
              {pairing.label}
            </h3>
            <span className="bg-amber-200 px-2 py-1 text-xs font-semibold uppercase text-stone-900">
              Round 1
            </span>
          </div>
          <PairingTeam seed={pairing.highSeed} team={pairing.highTeam} />
          <div className="my-2 text-center text-xs font-semibold uppercase text-stone-400">
            vs
          </div>
          <PairingTeam seed={pairing.lowSeed} team={pairing.lowTeam} />
        </article>
      ))}
    </div>
  );
}

function PairingTeam<TTeam extends RankedTeam>({
  seed,
  team,
}: {
  seed: number;
  team: TTeam;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-stone-950 font-mono text-sm font-semibold text-white">
        {seed}
      </span>
      <span className="min-w-0 truncate text-sm font-semibold text-stone-900">
        {team.name}
      </span>
    </div>
  );
}
