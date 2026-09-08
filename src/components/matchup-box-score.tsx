import { teamAvatarUrl } from "@/config/avatars";
import { StatusBadge } from "@/components/status-badge";
import {
  categoryStatLines,
  effectiveWinner,
  formatHitsAtBats,
  formatInningsPitched,
  formatRecord,
  matchupMeta,
  matchupStatusView,
  ordinal,
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
  const avatar = teamAvatarUrl(team?.id);

  return (
    <div
      className={`flex min-w-0 items-center gap-3 ${
        alignRight ? "sm:flex-row-reverse sm:text-right" : ""
      }`}
    >
      {avatar ? (
        // Hotlinked Yahoo CDN art; next/image would need a remotePatterns
        // allowlist for three hosts to optimize a 64px avatar. Not worth it.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          alt=""
          width={64}
          height={64}
          loading="lazy"
          className="h-14 w-14 shrink-0 rounded-full border border-stone-200 bg-white object-cover sm:h-16 sm:w-16"
        />
      ) : null}
      <div className="min-w-0">
        <span
          className={`flex items-center gap-2 ${alignRight ? "sm:flex-row-reverse" : ""}`}
        >
          <span
            className={`block truncate text-lg font-black sm:text-xl ${
              team === null ? "text-stone-400" : "text-stone-950"
            }`}
          >
            {team?.name ?? "TBD"}
          </span>
          {winner ? (
            <span className="inline-flex shrink-0 border border-emerald-700 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black uppercase text-emerald-900">
              Winner
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs font-semibold text-stone-500">
          {teamSubline(team)}
        </span>
      </div>
    </div>
  );
}

function cellClasses(winner: CategoryStatLine["winner"], side: "high" | "low"): string {
  if (winner === "tie") {
    return "text-stone-400";
  }

  return winner === side ? "bg-sky-100 font-black text-sky-950" : "text-stone-700";
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
  const tallyAttr =
    tally === null ? null : `${tally.highWins}-${tally.lowWins}-${tally.ties}`;

  return (
    <article
      className={`min-w-0 overflow-hidden border bg-white ${
        slot.status === "under_review" ? "border-rose-700" : "border-stone-300"
      }`}
      aria-labelledby={`${slot.id}-heading`}
    >
      <h4 id={`${slot.id}-heading`} className="sr-only">
        {meta.label}
      </h4>

      <div className="grid gap-4 px-4 py-5 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <TeamHeading team={slot.highTeam} side="high" winner={winner?.id === slot.highTeam?.id && winner !== null} />
        <div
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono text-4xl font-black text-stone-950"
          data-tally={tallyAttr ?? undefined}
        >
          <span>{tally?.highWins ?? "-"}</span>
          <span className="text-xs font-black uppercase text-stone-400">vs</span>
          <span>{tally?.lowWins ?? "-"}</span>
          {status.label === "live" || status.label === "pending" ? null : (
            <span className="basis-full text-center">
              <StatusBadge matchup={slot} upstreamUnderReview={slot.upstreamUnderReview} />
            </span>
          )}
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
                      <span
                        className="ml-1 text-amber-700"
                        title="Decided by the innings-pitched minimum"
                      >
                        *
                      </span>
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
