import Link from "next/link";

import {
  buildBracketSlots,
  effectiveWinner,
  formatTally,
  matchupMeta,
  matchupStatusView,
  roundLabel,
  type PublicMatchup,
  type PublicMatchupSlot,
  type PublicTeamRef,
} from "@/lib/public/matchups";

const badgeToneClasses = {
  stone: "border-stone-400 bg-stone-50 text-stone-700",
  rose: "border-rose-700 bg-rose-50 text-rose-900",
  amber: "border-amber-600 bg-amber-50 text-amber-900",
  emerald: "border-emerald-700 bg-emerald-50 text-emerald-900",
};

function seedLabel(team: PublicTeamRef | null): string {
  if (team === null) {
    return "TBD";
  }

  return team.finalSeed === null ? "?" : String(team.finalSeed);
}

function teamSeedText(team: PublicTeamRef | null): string {
  if (team === null || team.finalSeed === null) {
    return "Seed TBD";
  }

  return `Seed ${team.finalSeed}`;
}

function teamName(team: PublicTeamRef | null): string {
  return team?.name ?? "TBD";
}

export function StatusBadge({
  matchup,
  upstreamUnderReview = false,
}: {
  matchup: Pick<PublicMatchup, "status">;
  upstreamUnderReview?: boolean;
}) {
  const status = matchupStatusView(matchup, upstreamUnderReview);

  return (
    <span
      className={`inline-flex border px-2 py-1 text-xs font-black uppercase ${badgeToneClasses[status.tone]}`}
    >
      {status.label}
    </span>
  );
}

function TeamSlot({
  team,
  winner,
}: {
  team: PublicTeamRef | null;
  winner: boolean;
}) {
  const isTbd = team === null;

  return (
    <div
      className={`flex items-center gap-3 border px-3 py-3 ${
        winner
          ? "border-emerald-700 bg-emerald-50"
          : isTbd
            ? "border-dashed border-stone-300 bg-stone-50 text-stone-500"
            : "border-stone-200 bg-white"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center font-mono text-sm font-black ${
          winner
            ? "bg-emerald-800 text-white"
            : isTbd
              ? "bg-stone-200 text-stone-500"
              : "bg-stone-950 text-white"
        }`}
      >
        {seedLabel(team)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-black text-stone-950">
          {teamName(team)}
        </span>
        <span className="mt-1 block text-xs font-semibold uppercase text-stone-500">
          {teamSeedText(team)}
        </span>
      </span>
    </div>
  );
}

export function MatchupCard({ slot }: { slot: PublicMatchupSlot }) {
  const meta = matchupMeta(slot.id);
  const status = matchupStatusView(slot, slot.upstreamUnderReview);
  const winner = slot.status === "under_review" ? null : effectiveWinner(slot);
  const tally = formatTally(slot);

  return (
    <article
      className={`border bg-stone-50 ${
        slot.status === "under_review"
          ? "border-rose-700"
          : slot.exists
            ? "border-stone-300"
            : "border-dashed border-stone-300"
      }`}
    >
      <div className="border-b border-stone-300 bg-white px-4 py-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="font-mono text-xs font-black uppercase text-stone-500">
              {slot.id}
            </div>
            <h3 className="mt-1 text-base font-black text-stone-950">
              {meta.label}
            </h3>
          </div>
          <StatusBadge matchup={slot} upstreamUnderReview={slot.upstreamUnderReview} />
        </div>
        <div className="grid gap-2">
          <TeamSlot team={slot.highTeam} winner={winner?.id === slot.highTeam?.id} />
          <div className="text-center text-xs font-black uppercase text-stone-400">
            vs
          </div>
          <TeamSlot team={slot.lowTeam} winner={winner?.id === slot.lowTeam?.id} />
        </div>
      </div>

      {status.bannerTitle ? (
        <div className="border-b border-rose-200 bg-rose-50 px-4 py-3">
          <div className="text-xs font-black uppercase text-rose-900">
            {status.bannerTitle}
          </div>
          <p className="mt-1 text-sm font-semibold text-rose-950">
            {status.bannerText}
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 px-4 py-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-stone-500">Week</span>
          <span className="font-mono font-black text-stone-900">{slot.week}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-stone-500">Tally</span>
          <span className="font-mono font-black text-stone-900">
            {tally ?? "Not computed"}
          </span>
        </div>
        {slot.overrideWinner ? (
          <div className="border border-amber-300 bg-amber-50 px-3 py-2">
            <div className="text-xs font-black uppercase text-amber-900">
              Commissioner override
            </div>
            <div className="mt-1 font-semibold text-amber-950">
              Winner: {slot.overrideWinner.name}
            </div>
          </div>
        ) : null}
        <Link
          href={`/matchup/${slot.id}`}
          className="inline-flex justify-center border border-stone-950 bg-stone-950 px-3 py-2 text-sm font-black uppercase text-white hover:bg-rose-900"
        >
          Matchup detail
        </Link>
      </div>
    </article>
  );
}

export function BracketView({
  matchups,
  id,
  title = "Loser Bowl Bracket",
}: {
  matchups: readonly PublicMatchup[];
  id?: string;
  title?: string;
}) {
  const slots = buildBracketSlots(matchups);
  const hasReview = slots.some((slot) => slot.status === "under_review");
  const rounds = [1, 2, 3] as const;

  return (
    <section id={id} className="border-b border-stone-300 bg-stone-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <p className="text-sm font-semibold uppercase text-rose-800">
            Bracket
          </p>
          <h2 className="text-2xl font-black text-stone-950">{title}</h2>
        </div>

        {hasReview ? (
          <div className="mb-4 border border-rose-700 bg-rose-50 px-4 py-4">
            <div className="text-sm font-black uppercase text-rose-900">
              Commissioner review in progress
            </div>
            <p className="mt-1 text-sm font-semibold text-rose-950">
              A stat correction is being reviewed. The affected result is frozen
              until the commissioner resolves it.
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          {rounds.map((round) => (
            <div key={round} className="min-w-0">
              <div className="mb-3 border-b-4 border-stone-950 pb-2">
                <h3 className="text-lg font-black text-stone-950">
                  {roundLabel(round)}
                </h3>
                <div className="mt-1 font-mono text-xs font-semibold uppercase text-stone-500">
                  Week {slots.find((slot) => slot.round === round)?.week}
                </div>
              </div>
              <div className="grid gap-3">
                {slots
                  .filter((slot) => slot.round === round)
                  .map((slot) => (
                    <MatchupCard key={slot.id} slot={slot} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
