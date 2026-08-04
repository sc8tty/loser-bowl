import Link from "next/link";

import { LEAGUE_CONFIG } from "@/config/league";
import { StatusBadge } from "@/components/bracket-view";
import { YahooFooter } from "@/components/home-page";
import {
  categoryStatLines,
  effectiveWinner,
  formatDecidedBy,
  formatTally,
  hasUpstreamReview,
  matchupMeta,
  matchupStatusView,
  resultExplanation,
  tallyParts,
  type PublicMatchup,
  type PublicTeamRef,
} from "@/lib/public/matchups";
import type { MatchupDetailData } from "@/lib/sync/trigger";

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

function teamSeed(team: PublicTeamRef | null): string {
  if (team === null || team.finalSeed === null) {
    return "Seed TBD";
  }

  return `Seed ${team.finalSeed}`;
}

function teamName(team: PublicTeamRef | null): string {
  return team?.name ?? "TBD";
}

function Header({
  matchup,
  matchups,
}: {
  matchup: PublicMatchup;
  matchups: readonly PublicMatchup[];
}) {
  const meta = matchupMeta(matchup.id);
  const winner =
    matchup.status === "under_review" ? null : effectiveWinner(matchup);
  const upstreamReview = hasUpstreamReview(matchup, matchups);

  return (
    <header className="border-b border-stone-800 bg-stone-950 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase text-amber-300">
              Lander&apos;s League Loser Bowl
            </p>
            <h1 className="text-4xl font-black">{meta.label}</h1>
            <p className="mt-2 text-sm font-semibold text-stone-300">
              {teamName(matchup.highTeam)} vs {teamName(matchup.lowTeam)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <StatusBadge matchup={matchup} upstreamUnderReview={upstreamReview} />
            {winner ? (
              <span className="inline-flex border border-emerald-700 bg-emerald-50 px-2 py-1 text-xs font-black uppercase text-emerald-900">
                Winner: {winner.name}
              </span>
            ) : null}
          </div>
        </div>
        <div className="grid gap-3 border-t border-stone-700 pt-4 text-sm text-stone-200 sm:grid-cols-3">
          <div>
            <span className="font-semibold text-white">Round</span> {matchup.round}
          </div>
          <div>
            <span className="font-semibold text-white">Week</span> {matchup.week}
          </div>
          <div>
            <span className="font-semibold text-white">Tally</span>{" "}
            {formatTally(matchup) ?? "Not computed"}
          </div>
        </div>
      </div>
    </header>
  );
}

function TeamPanel({
  label,
  team,
  wins,
}: {
  label: string;
  team: PublicTeamRef | null;
  wins: number | null;
}) {
  return (
    <div className="border border-stone-300 bg-white px-4 py-4">
      <div className="text-xs font-black uppercase text-stone-500">{label}</div>
      <div className="mt-2 text-xl font-black text-stone-950">{teamName(team)}</div>
      <div className="mt-1 text-sm font-semibold uppercase text-stone-500">
        {teamSeed(team)}
      </div>
      <div className="mt-4 border-t border-stone-200 pt-3">
        <div className="text-xs font-black uppercase text-stone-500">
          Category wins
        </div>
        <div className="mt-1 font-mono text-3xl font-black text-stone-950">
          {wins === null ? "-" : wins}
        </div>
      </div>
    </div>
  );
}

function ReviewBanner({
  matchup,
  matchups,
}: {
  matchup: PublicMatchup;
  matchups: readonly PublicMatchup[];
}) {
  const status = matchupStatusView(matchup, hasUpstreamReview(matchup, matchups));

  if (status.bannerTitle !== null) {
    return (
      <div className="border border-rose-700 bg-rose-50 px-4 py-4">
        <div className="text-sm font-black uppercase text-rose-900">
          {status.bannerTitle}
        </div>
        <p className="mt-1 text-sm font-semibold text-rose-950">
          {status.bannerText}
        </p>
      </div>
    );
  }

  if (hasUpstreamReview(matchup, matchups)) {
    return (
      <div className="border border-amber-600 bg-amber-50 px-4 py-4">
        <div className="text-sm font-black uppercase text-amber-900">
          Commissioner review upstream
        </div>
        <p className="mt-1 text-sm font-semibold text-amber-950">
          An earlier result is under review, so this matchup may wait before it
          can settle.
        </p>
      </div>
    );
  }

  return null;
}

function StatLines({
  matchup,
  data,
}: {
  matchup: PublicMatchup;
  data: Extract<MatchupDetailData, { status: "ready" | "not_created" }>;
}) {
  const rows = categoryStatLines(matchup, data.statCategories);

  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-stone-400 bg-white px-4 py-6 text-sm font-semibold text-stone-600">
        Full stat lines are not yet computed for this matchup.
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-stone-300 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-stone-100 text-xs font-semibold uppercase text-stone-600">
            <tr>
              <th scope="col" className="px-4 py-3">
                Category
              </th>
              <th scope="col" className="min-w-36 px-4 py-3">
                {teamName(matchup.highTeam)}
              </th>
              <th scope="col" className="min-w-36 px-4 py-3">
                {teamName(matchup.lowTeam)}
              </th>
              <th scope="col" className="px-4 py-3">
                Winner
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {rows.map((row) => (
              <tr key={row.slug} className="bg-white">
                <th scope="row" className="px-4 py-3 font-black text-stone-950">
                  {row.label}
                  {row.policyLabel ? (
                    <span className="ml-2 inline-flex border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-black uppercase text-amber-900">
                      {row.policyLabel}
                    </span>
                  ) : null}
                </th>
                <td
                  className={`px-4 py-3 font-mono text-sm ${
                    row.winner === "high"
                      ? "font-black text-emerald-900"
                      : "text-stone-700"
                  }`}
                >
                  {row.highValue}
                </td>
                <td
                  className={`px-4 py-3 font-mono text-sm ${
                    row.winner === "low"
                      ? "font-black text-emerald-900"
                      : "text-stone-700"
                  }`}
                >
                  {row.lowValue}
                </td>
                <td className="px-4 py-3 font-semibold text-stone-700">
                  {row.winner === "tie"
                    ? "Tie"
                    : row.winner === "high"
                      ? teamName(matchup.highTeam)
                      : teamName(matchup.lowTeam)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultSummary({ matchup }: { matchup: PublicMatchup }) {
  const tally = tallyParts(matchup);
  const decidedBy = formatDecidedBy(matchup.decidedBy);

  return (
    <div className="border border-stone-300 bg-white px-4 py-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-rose-800">
            Result
          </p>
          <h2 className="text-2xl font-black text-stone-950">
            Running Tally
          </h2>
        </div>
        <div className="font-mono text-2xl font-black text-stone-950">
          {formatTally(matchup) ?? "-"}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <TeamPanel
          label="High seed"
          team={matchup.highTeam}
          wins={tally?.highWins ?? null}
        />
        <div className="flex items-center justify-center font-black uppercase text-stone-400">
          vs
        </div>
        <TeamPanel
          label="Low seed"
          team={matchup.lowTeam}
          wins={tally?.lowWins ?? null}
        />
      </div>
      <div className="mt-4 border border-stone-200 bg-stone-50 px-4 py-3">
        <p className="text-sm font-semibold text-stone-800">
          {resultExplanation(matchup)}
        </p>
        {decidedBy ? (
          <p className="mt-2 text-xs font-black uppercase text-stone-500">
            Decided by {decidedBy}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function OverrideProvenance({ matchup }: { matchup: PublicMatchup }) {
  if (matchup.overrideWinner === null) {
    return null;
  }

  return (
    <div className="border border-amber-400 bg-amber-50 px-4 py-4">
      <div className="text-sm font-black uppercase text-amber-900">
        Commissioner override
      </div>
      <p className="mt-2 text-sm font-semibold text-amber-950">
        Winner: {matchup.overrideWinner.name}
      </p>
      {matchup.overrideNote ? (
        <p className="mt-2 text-sm text-amber-950">{matchup.overrideNote}</p>
      ) : null}
      <p className="mt-3 font-mono text-xs font-semibold text-amber-900">
        Recorded {formatDateTime(matchup.overriddenAt)}
      </p>
    </div>
  );
}

function NotCreatedState({
  data,
}: {
  data: Extract<MatchupDetailData, { status: "not_created" }>;
}) {
  const meta = matchupMeta(data.matchupId);

  return (
    <div className="border border-dashed border-stone-400 bg-white px-5 py-8 text-center">
      <p className="mb-2 text-sm font-semibold uppercase text-rose-800">
        Slot pending
      </p>
      <h2 className="text-2xl font-black text-stone-950">
        {meta.label} is not created yet.
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm font-semibold text-stone-700">
        This is a valid Loser Bowl matchup slot. It will fill after the seed lock
        creates the bracket.
      </p>
    </div>
  );
}

function AwaitingState({
  data,
}: {
  data: Extract<MatchupDetailData, { status: "awaiting" }>;
}) {
  return (
    <div className="border border-dashed border-stone-400 bg-white px-5 py-8 text-center">
      <p className="mb-2 text-sm font-semibold uppercase text-rose-800">
        Awaiting league data
      </p>
      <h2 className="text-2xl font-black text-stone-950">{data.reason}</h2>
    </div>
  );
}

export function MatchupDetailView({
  data,
}: {
  data: Exclude<MatchupDetailData, { status: "unknown_matchup" }>;
}) {
  const matchupLabel = matchupMeta(data.matchupId).label;
  const matchupShell =
    data.status === "awaiting" ? null : (
      <Header matchup={data.matchup} matchups={data.matchups} />
    );

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      {matchupShell ?? (
        <header className="border-b border-stone-800 bg-stone-950 text-white">
          <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
            <p className="mb-2 text-sm font-semibold uppercase text-amber-300">
              Lander&apos;s League Loser Bowl
            </p>
            <h1 className="text-4xl font-black">{matchupLabel}</h1>
          </div>
        </header>
      )}

      <main>
        <section className="border-b border-stone-300 bg-stone-100">
          <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 sm:px-6 lg:px-8">
            <div>
              <Link
                href="/#full-bracket"
                className="inline-flex border border-stone-950 px-3 py-2 text-sm font-black uppercase text-stone-950 hover:bg-stone-950 hover:text-white"
              >
                Back to bracket
              </Link>
            </div>

            {data.status === "awaiting" ? (
              <AwaitingState data={data} />
            ) : data.status === "not_created" ? (
              <NotCreatedState data={data} />
            ) : (
              <>
                <ReviewBanner matchup={data.matchup} matchups={data.matchups} />
                <ResultSummary matchup={data.matchup} />
                <OverrideProvenance matchup={data.matchup} />
                <div>
                  <div className="mb-4">
                    <p className="text-sm font-semibold uppercase text-amber-700">
                      Box score
                    </p>
                    <h2 className="text-2xl font-black text-stone-950">
                      Category Stat Lines
                    </h2>
                  </div>
                  <StatLines matchup={data.matchup} data={data} />
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <Fact label="Locked" value={formatDateTime(data.matchup.lockedAt)} />
                  <Fact label="Settled" value={formatDateTime(data.matchup.settledAt)} />
                  <Fact
                    label="Override recorded"
                    value={formatDateTime(data.matchup.overriddenAt)}
                  />
                </div>
              </>
            )}
          </div>
        </section>
      </main>

      <YahooFooter />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-stone-300 bg-white px-3 py-3">
      <div className="text-xs font-semibold uppercase text-stone-500">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold text-stone-950">
        {value}
      </div>
    </div>
  );
}
