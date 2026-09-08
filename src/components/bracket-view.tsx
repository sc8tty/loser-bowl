import { LEAGUE_CONFIG } from "@/config/league";
import { MatchupBoxScore } from "@/components/matchup-box-score";
import { StatusBadge } from "@/components/status-badge";
import {
  buildBracketSlots,
  effectiveWinner,
  matchupMeta,
  roundLabel,
  type PublicMatchup,
  type PublicMatchupSlot,
  type PublicStatCategory,
  type PublicTeamRef,
} from "@/lib/public/matchups";

// matchup-detail.tsx and older call sites import the badge from here.
export { StatusBadge } from "@/components/status-badge";

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

function formatMonthDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function roundDates(round: 1 | 2 | 3): string | null {
  const config = LEAGUE_CONFIG.rounds.find((candidate) => candidate.round === round);

  return config === undefined
    ? null
    : `${formatMonthDay(config.start)}–${formatMonthDay(config.end)}`;
}

/**
 * The round the league is watching right now: the earliest round with any
 * matchup still undecided. Once everything is final, that's the Final.
 */
export function currentRound(slots: readonly PublicMatchupSlot[]): 1 | 2 | 3 {
  for (const round of [1, 2, 3] as const) {
    if (slots.some((slot) => slot.round === round && slot.status !== "final")) {
      return round;
    }
  }

  return 3;
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

/** Compact card for rounds that aren't the current one (upcoming or settled). */
export function MatchupCard({ slot }: { slot: PublicMatchupSlot }) {
  const meta = matchupMeta(slot.id);
  const winner = slot.status === "under_review" ? null : effectiveWinner(slot);

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
      <div className="bg-white px-4 py-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <h4 className="text-base font-black text-stone-950">{meta.label}</h4>
          <StatusBadge matchup={slot} upstreamUnderReview={slot.upstreamUnderReview} />
        </div>
        <div className="grid gap-2">
          <TeamSlot
            team={slot.highTeam}
            winner={winner !== null && winner.id === slot.highTeam?.id}
          />
          <div className="text-center text-xs font-black uppercase text-stone-400">
            vs
          </div>
          <TeamSlot
            team={slot.lowTeam}
            winner={winner !== null && winner.id === slot.lowTeam?.id}
          />
        </div>
      </div>
      {slot.overrideWinner ? (
        <div className="border-t border-amber-300 bg-amber-50 px-4 py-3">
          <div className="text-xs font-black uppercase text-amber-900">
            Commissioner override
          </div>
          <div className="mt-1 text-sm font-semibold text-amber-950">
            Winner: {slot.overrideWinner.name}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function RoundHeading({ round }: { round: 1 | 2 | 3 }) {
  const dates = roundDates(round);

  return (
    <div className="mb-3 border-b-4 border-stone-950 pb-2">
      <h3 className="text-lg font-black text-stone-950">{roundLabel(round)}</h3>
      {dates ? (
        <div className="mt-1 font-mono text-xs font-semibold uppercase text-stone-500">
          {dates}
        </div>
      ) : null}
    </div>
  );
}

export function BracketView({
  matchups,
  statCategories,
  id,
  title = "Loser Bowl Bracket",
}: {
  matchups: readonly PublicMatchup[];
  statCategories: readonly PublicStatCategory[];
  id?: string;
  title?: string;
}) {
  const slots = buildBracketSlots(matchups);
  const hasReview = slots.some((slot) => slot.status === "under_review");
  const round = currentRound(slots);
  const otherRounds = ([1, 2, 3] as const).filter((candidate) => candidate !== round);

  return (
    <section id={id} className="border-b border-stone-300 bg-stone-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <p className="text-sm font-semibold uppercase text-rose-800">Bracket</p>
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

        <RoundHeading round={round} />
        <div className="grid gap-5">
          {slots
            .filter((slot) => slot.round === round)
            .map((slot) => (
              <MatchupBoxScore
                key={slot.id}
                slot={slot}
                statCategories={statCategories}
              />
            ))}
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          {otherRounds.map((other) => (
            <div key={other} className="min-w-0">
              <RoundHeading round={other} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {slots
                  .filter((slot) => slot.round === other)
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
