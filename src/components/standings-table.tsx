import type { RankedTeam } from "@/lib/bracket";

export type StandingsTeam = RankedTeam & {
  wins: number;
  losses: number;
  ties: number;
};

function recordFor(team: StandingsTeam) {
  return `${team.wins}-${team.losses}-${team.ties}`;
}

function isDropZone(team: StandingsTeam) {
  return team.currentRank >= 9 && team.currentRank <= 16;
}

export function StandingsTable({ teams }: { teams: readonly StandingsTeam[] }) {
  const firstDropZoneIndex = teams.findIndex(isDropZone);

  return (
    <div className="overflow-hidden border border-stone-300 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-stone-100 text-xs font-semibold uppercase text-stone-600">
            <tr>
              <th scope="col" className="w-16 px-4 py-3">
                Rank
              </th>
              <th scope="col" className="min-w-48 px-4 py-3">
                Team
              </th>
              <th scope="col" className="px-4 py-3">
                Record
              </th>
              <th scope="col" className="px-4 py-3">
                Bowl
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {teams.map((team, index) => (
              <DropZoneFragment
                key={team.id}
                team={team}
                showHeader={index === firstDropZoneIndex}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DropZoneFragment({
  team,
  showHeader,
}: {
  team: StandingsTeam;
  showHeader: boolean;
}) {
  const inDropZone = isDropZone(team);

  return (
    <>
      {showHeader ? (
        <tr className="bg-rose-950 text-white">
          <th
            scope="rowgroup"
            colSpan={4}
            className="px-4 py-2 text-xs font-semibold uppercase"
          >
            The Drop Zone
          </th>
        </tr>
      ) : null}
      <tr
        className={
          inDropZone
            ? "border-l-4 border-l-rose-700 bg-rose-50"
            : "bg-white"
        }
      >
        <td className="px-4 py-3 font-mono text-sm font-semibold text-stone-700">
          {team.currentRank}
        </td>
        <td className="px-4 py-3">
          <div className="font-semibold text-stone-950">{team.name}</div>
          <div className="mt-1 text-xs text-stone-500">{team.id}</div>
        </td>
        <td className="px-4 py-3 font-mono text-sm text-stone-700">
          {recordFor(team)}
        </td>
        <td className="px-4 py-3">
          {inDropZone ? (
            <span className="inline-flex border border-rose-300 bg-white px-2 py-1 text-xs font-semibold uppercase text-rose-800">
              Seed {team.currentRank}
            </span>
          ) : (
            <span className="text-sm text-stone-400">-</span>
          )}
        </td>
      </tr>
    </>
  );
}
