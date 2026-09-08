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

type ColumnGroups = { batting: Column[]; pitching: Column[] };

function buildColumns(rows: readonly CategoryStatLine[]): ColumnGroups {
  const batting = rows.filter((row) => !PITCHING_SLUGS.has(row.slug));
  const pitching = rows.filter((row) => PITCHING_SLUGS.has(row.slug));

  return {
    batting: [
      { kind: "support", key: "hab", label: "H/AB" },
      ...batting.map((row): Column => ({ kind: "category", row })),
    ],
    pitching: [
      { kind: "support", key: "ip", label: "IP" },
      ...pitching.map((row): Column => ({ kind: "category", row })),
    ],
  };
}

function columnKey(column: Column): string {
  return column.kind === "support" ? column.key : column.row.slug;
}

function columnLabel(column: Column): string {
  return column.kind === "support" ? column.label : column.row.label;
}

function columnValue(
  column: Column,
  side: "high" | "low",
  stats: PublicMatchupSlot["highStats"],
): string {
  if (column.kind === "support") {
    return column.key === "hab" ? formatHitsAtBats(stats) : formatInningsPitched(stats);
  }

  return side === "high" ? column.row.highValue : column.row.lowValue;
}

function cellTone(column: Column, side: "high" | "low"): string {
  if (column.kind === "support") {
    return "text-stone-700";
  }

  if (column.row.winner === "tie") {
    return "text-stone-400";
  }

  return column.row.winner === side
    ? "bg-sky-100 font-black text-sky-950"
    : "text-stone-700";
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

function Avatar({ team, size }: { team: PublicTeamRef | null; size: "sm" | "lg" }) {
  const avatar = teamAvatarUrl(team?.id);
  const box = size === "lg" ? "h-16 w-16" : "h-14 w-14";

  if (avatar === null) {
    return <span className={`${box} shrink-0 rounded-full bg-stone-200`} aria-hidden />;
  }

  return (
    // Hotlinked Yahoo CDN art; next/image would need a remotePatterns
    // allowlist for three hosts to optimize a 64px avatar. Not worth it.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatar}
      alt=""
      width={64}
      height={64}
      loading="lazy"
      className={`${box} shrink-0 rounded-full border border-stone-200 bg-white object-cover`}
    />
  );
}

function WinnerTag() {
  return (
    <span className="inline-flex shrink-0 border border-emerald-700 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black uppercase text-emerald-900">
      Winner
    </span>
  );
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
        alignRight ? "flex-row-reverse text-right" : ""
      }`}
    >
      <Avatar team={team} size="lg" />
      <div className="min-w-0">
        <span className={`flex items-center gap-2 ${alignRight ? "flex-row-reverse" : ""}`}>
          <span
            className={`block truncate text-xl font-black ${
              team === null ? "text-stone-400" : "text-stone-950"
            }`}
          >
            {team?.name ?? "TBD"}
          </span>
          {winner ? <WinnerTag /> : null}
        </span>
        <span className="mt-0.5 block text-xs font-semibold text-stone-500">
          {teamSubline(team)}
        </span>
      </div>
    </div>
  );
}

function Score({
  tally,
  slot,
  status,
  size,
}: {
  tally: ReturnType<typeof tallyParts>;
  slot: PublicMatchupSlot;
  status: ReturnType<typeof matchupStatusView>;
  size: "sm" | "lg";
}) {
  const tallyAttr =
    tally === null ? undefined : `${tally.highWins}-${tally.lowWins}-${tally.ties}`;

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono font-black text-stone-950 ${
        size === "lg" ? "text-4xl" : "text-5xl"
      }`}
      data-tally={tallyAttr}
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
  );
}

/** Phone header, Yahoo-app style: names on top, avatars flanking the score. */
function StackedHeader({
  slot,
  tally,
  status,
  winner,
}: {
  slot: PublicMatchupSlot;
  tally: ReturnType<typeof tallyParts>;
  status: ReturnType<typeof matchupStatusView>;
  winner: PublicTeamRef | null;
}) {
  const highWon = winner !== null && winner.id === slot.highTeam?.id;
  const lowWon = winner !== null && winner.id === slot.lowTeam?.id;

  return (
    <div className="px-4 py-4 sm:hidden">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-left">
          <span className="block truncate text-base font-black text-stone-950">
            {slot.highTeam?.name ?? "TBD"}
          </span>
          {highWon ? <WinnerTag /> : null}
        </span>
        <span className="min-w-0 text-right">
          <span className="block truncate text-base font-black text-stone-950">
            {slot.lowTeam?.name ?? "TBD"}
          </span>
          {lowWon ? <WinnerTag /> : null}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <Avatar team={slot.highTeam} size="sm" />
        <Score tally={tally} slot={slot} status={status} size="sm" />
        <Avatar team={slot.lowTeam} size="sm" />
      </div>
      <div className="mt-3 flex justify-between gap-3 text-[11px] font-semibold text-stone-500">
        <span className="text-left">{teamSubline(slot.highTeam)}</span>
        <span className="text-right">{teamSubline(slot.lowTeam)}</span>
      </div>
    </div>
  );
}

/** Phone stat list: high value | category | low value, one row per category. */
function StackedStats({
  title,
  columns,
  slot,
}: {
  title: string;
  columns: readonly Column[];
  slot: PublicMatchupSlot;
}) {
  return (
    <div>
      <div className="bg-stone-100 px-4 py-2 text-xs font-black uppercase text-stone-600">
        {title}
      </div>
      <div className="divide-y divide-stone-200">
        {columns.map((column) => (
          <div
            key={columnKey(column)}
            className="grid grid-cols-[1fr_4.5rem_1fr] items-stretch text-center font-mono text-sm tabular-nums"
          >
            <span className={`px-3 py-2.5 ${cellTone(column, "high")}`}>
              {columnValue(column, "high", slot.highStats)}
            </span>
            <span className="px-1 py-2.5 font-sans text-xs font-black uppercase text-stone-500">
              {columnLabel(column)}
              {column.kind === "category" && column.row.policyLabel ? (
                <span className="ml-0.5 text-amber-700" title="Decided by the innings-pitched minimum">
                  *
                </span>
              ) : null}
            </span>
            <span className={`px-3 py-2.5 ${cellTone(column, "low")}`}>
              {columnValue(column, "low", slot.lowStats)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
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
      {columns.map((column) => (
        <td
          key={columnKey(column)}
          className={`whitespace-nowrap px-3 py-3 text-center font-mono text-sm tabular-nums ${cellTone(column, side)}`}
        >
          {columnValue(column, side, stats)}
        </td>
      ))}
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
  const groups = buildColumns(rows);
  const columns = [...groups.batting, ...groups.pitching];

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

      <StackedHeader slot={slot} tally={tally} status={status} winner={winner} />

      <div className="hidden gap-4 px-4 py-5 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <TeamHeading
          team={slot.highTeam}
          side="high"
          winner={winner !== null && winner.id === slot.highTeam?.id}
        />
        <Score tally={tally} slot={slot} status={status} size="lg" />
        <TeamHeading
          team={slot.lowTeam}
          side="low"
          winner={winner !== null && winner.id === slot.lowTeam?.id}
        />
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
        <>
          <div className="border-t border-stone-200 sm:hidden">
            <StackedStats title="Batters" columns={groups.batting} slot={slot} />
            <StackedStats title="Pitchers" columns={groups.pitching} slot={slot} />
          </div>

          <div className="hidden overflow-x-auto border-t border-stone-200 sm:block">
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
                      key={columnKey(column)}
                      scope="col"
                      className="whitespace-nowrap px-3 py-2 text-center"
                    >
                      {columnLabel(column)}
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
        </>
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
