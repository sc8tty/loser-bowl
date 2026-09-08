import { LEAGUE_CONFIG } from "@/config/league";
import { StatusBadge } from "@/components/status-badge";
import {
  categoryStatLines,
  effectiveWinner,
  formatHitsAtBats,
  formatInningsPitched,
  formatRecord,
  isLiveMatchup,
  matchupMeta,
  matchupStatusView,
  ordinal,
  resultExplanation,
  tallyParts,
  type CategoryStatLine,
  type PublicMatchupSlot,
  type PublicStatCategory,
  type PublicTeamRef,
} from "@/lib/public/matchups";

// Yahoo lists batting categories first, then pitching. The two non-scoring
// columns it shows (H/AB, IP) sit at the head of each group; this set decides
// where the pitching group starts for any category order the league uses.
const PITCHING_SLUGS = new Set([
  "w",
  "l",
  "bb",
  "k",
  "era",
  "whip",
  "k9",
  "nsvh",
  "sv",
  "hld",
  "qs",
  "ip",
]);

type Column =
  | { kind: "support"; key: "hab" | "ip"; label: string }
  | { kind: "category"; row: CategoryStatLine };

function buildColumns(rows: readonly CategoryStatLine[]): Column[] {
  const batting = rows.filter((row) => !PITCHING_SLUGS.has(row.slug));
  const pitching = rows.filter((row) => PITCHING_SLUGS.has(row.slug));

  return [
    { kind: "support", key: "hab", label: "H/AB" },
    ...batting.map((row): Column => ({ kind: "category", row })),
    { kind: "support", key: "ip", label: "IP" },
    ...pitching.map((row): Column => ({ kind: "category", row })),
  ];
}

function formatDateTime(date: Date | null): string {
  if (date === null) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: LEAGUE_CONFIG.timeZone,
  }).format(date);
}

function teamSubline(team: PublicTeamRef | null): string {
  if (team === null) {
    return "Seed TBD";
  }

  const parts = [team.finalSeed === null ? "Seed TBD" : `Seed ${team.finalSeed}`];
  const record = formatRecord(team);

  if (record !== null) {
    parts.push(`${record} | ${ordinal(team.currentRank)}`);
  }

  return parts.join(" · ");
}

function TeamHeading({
  team,
  side,
  winner,
}: {
  team: PublicTeamRef | null;
  side: "high" | "low";
  winner: boolean;
}) {
  const alignRight = side === "low";

  return (
    <div
      className={`flex min-w-0 items-center gap-3 ${
        alignRight ? "sm:flex-row-reverse sm:text-right" : ""
      }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center font-mono text-base font-black ${
          winner
            ? "bg-emerald-800 text-white"
            : team === null
              ? "bg-stone-200 text-stone-500"
              : "bg-stone-950 text-white"
        }`}
      >
        {team === null || team.finalSeed === null ? "?" : team.finalSeed}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-lg font-black text-stone-950 sm:text-xl">
          {team?.name ?? "TBD"}
        </span>
        <span className="mt-0.5 block text-xs font-semibold text-stone-500">
          {teamSubline(team)}
        </span>
      </span>
    </div>
  );
}

function cellClasses(winner: CategoryStatLine["winner"], side: "high" | "low"): string {
  if (winner === "tie") {
    return "text-stone-400";
  }

  return winner === side ? "bg-stone-950 font-black text-white" : "text-stone-700";
}

function StatRow({
  team,
  side,
  stats,
  columns,
  wins,
}: {
  team: PublicTeamRef | null;
  side: "high" | "low";
  stats: PublicMatchupSlot["highStats"];
  columns: readonly Column[];
  wins: number | null;
}) {
  return (
    <tr className="border-t border-stone-200">
      <th
        scope="row"
        className="sticky left-0 z-10 min-w-40 bg-white px-3 py-3 text-left text-sm font-black text-stone-950"
      >
        {team?.name ?? "TBD"}
      </th>
      {columns.map((column) =>
        column.kind === "support" ? (
          <td
            key={column.key}
            className="whitespace-nowrap px-3 py-3 text-center font-mono text-sm tabular-nums text-stone-700"
          >
            {column.key === "hab" ? formatHitsAtBats(stats) : formatInningsPitched(stats)}
          </td>
        ) : (
          <td
            key={column.row.slug}
            className={`whitespace-nowrap px-3 py-3 text-center font-mono text-sm tabular-nums ${cellClasses(column.row.winner, side)}`}
          >
            {side === "high" ? column.row.highValue : column.row.lowValue}
          </td>
        ),
      )}
      <td className="whitespace-nowrap px-3 py-3 text-center font-mono text-lg font-black tabular-nums text-stone-950">
        {wins ?? "-"}
      </td>
    </tr>
  );
}

export function MatchupBoxScore({
  slot,
  statCategories,
}: {
  slot: PublicMatchupSlot;
  statCategories: readonly PublicStatCategory[];
}) {
  const meta = matchupMeta(slot.id);
  const status = matchupStatusView(slot, slot.upstreamUnderReview);
  const winner = slot.status === "under_review" ? null : effectiveWinner(slot);
  const tally = tallyParts(slot);
  const rows = categoryStatLines(slot, statCategories);
  const columns = buildColumns(rows);
  const live = isLiveMatchup(slot);
  const tallyAttr =
    tally === null ? null : `${tally.highWins}-${tally.lowWins}-${tally.ties}`;

  return (
    <article
      className={`min-w-0 overflow-hidden border bg-white ${
        slot.status === "under_review" ? "border-rose-700" : "border-stone-300"
      }`}
      aria-labelledby={`${slot.id}-heading`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-2">
        <h4
          id={`${slot.id}-heading`}
          className="font-mono text-xs font-black uppercase text-stone-500"
        >
          {meta.label}
        </h4>
        <StatusBadge matchup={slot} upstreamUnderReview={slot.upstreamUnderReview} />
      </div>

      <div className="grid gap-4 px-4 py-5 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <TeamHeading team={slot.highTeam} side="high" winner={winner?.id === slot.highTeam?.id && winner !== null} />
        <div
          className="flex items-center justify-center gap-4 font-mono text-4xl font-black text-stone-950"
          data-tally={tallyAttr ?? undefined}
        >
          <span>{tally?.highWins ?? "-"}</span>
          <span className="text-xs font-black uppercase text-stone-400">vs</span>
          <span>{tally?.lowWins ?? "-"}</span>
        </div>
        <TeamHeading team={slot.lowTeam} side="low" winner={winner?.id === slot.lowTeam?.id && winner !== null} />
      </div>

      {status.bannerTitle ? (
        <div className="border-t border-rose-200 bg-rose-50 px-4 py-3">
          <div className="text-xs font-black uppercase text-rose-900">
            {status.bannerTitle}
          </div>
          <p className="mt-1 text-sm font-semibold text-rose-950">{status.bannerText}</p>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="border-t border-stone-200 px-4 py-4 text-sm font-semibold text-stone-500">
          {slot.highTeam === null || slot.lowTeam === null
            ? "Teams are set once the previous round settles."
            : `No stats imported for Week ${slot.week} yet.`}
        </div>
      ) : (
        <div className="overflow-x-auto border-t border-stone-200">
          <table className="w-full min-w-max border-collapse text-left">
            <thead className="bg-stone-100 text-xs font-semibold uppercase text-stone-500">
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-10 min-w-40 bg-stone-100 px-3 py-2 text-left"
                >
                  Team
                </th>
                {columns.map((column) => (
                  <th
                    key={column.kind === "support" ? column.key : column.row.slug}
                    scope="col"
                    className="whitespace-nowrap px-3 py-2 text-center"
                  >
                    {column.kind === "support" ? column.label : column.row.label}
                    {column.kind === "category" && column.row.policyLabel ? (
                      <span className="ml-1 text-amber-700">*</span>
                    ) : null}
                  </th>
                ))}
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-center">
                  Score
                </th>
              </tr>
            </thead>
            <tbody>
              <StatRow
                team={slot.highTeam}
                side="high"
                stats={slot.highStats}
                columns={columns}
                wins={tally?.highWins ?? null}
              />
              <StatRow
                team={slot.lowTeam}
                side="low"
                stats={slot.lowStats}
                columns={columns}
                wins={tally?.lowWins ?? null}
              />
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 bg-stone-50 px-4 py-2 text-xs font-semibold text-stone-600">
        <span>{resultExplanation(slot)}</span>
        {live && slot.liveTally !== null ? (
          <span className="text-stone-500">
            Stats as of {formatDateTime(slot.liveTally.asOf)} · IP minimum applies at
            week close
          </span>
        ) : null}
        {rows.some((row) => row.policyLabel !== null) ? (
          <span className="text-amber-800">* decided by the innings minimum</span>
        ) : null}
      </div>

      {slot.overrideWinner ? (
        <div className="border-t border-amber-300 bg-amber-50 px-4 py-3">
          <div className="text-xs font-black uppercase text-amber-900">
            Commissioner override
          </div>
          <div className="mt-1 text-sm font-semibold text-amber-950">
            Winner: {slot.overrideWinner.name}
            {slot.overrideNote ? `. ${slot.overrideNote}` : ""}
          </div>
        </div>
      ) : null}
    </article>
  );
}
