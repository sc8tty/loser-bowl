import { LEAGUE_CONFIG } from "@/config/league";
import { BracketView } from "@/components/bracket-view";
import { ProjectedPairings } from "@/components/projected-pairings";
import { StandingsTable } from "@/components/standings-table";
import { formatLockCountdown, getProjectedRoundOnePairings } from "@/lib/bracket";
import { buildBracketSlots, effectiveWinner } from "@/lib/public/matchups";
import type { LeagueData } from "@/lib/sync/trigger";

export function formatUpdatedAgo(lastSuccessAt: Date | null, now: Date): string {
  if (lastSuccessAt === null) {
    return "\u2014";
  }

  const minutes = Math.max(
    0,
    Math.round((now.getTime() - lastSuccessAt.getTime()) / 60_000),
  );

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);

  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

function formatConfigDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function pageTitle(data: LeagueData): string {
  if (data.status === "awaiting" || data.phase === "race") {
    return "Race to the Bottom";
  }

  if (data.phase === "champion") {
    return "Champion Crowned";
  }

  return "Loser Bowl Bracket";
}

export function HomePage({ data, now }: { data: LeagueData; now: Date }) {
  const updatedAgo = formatUpdatedAgo(data.lastSuccessAt, now);
  const lockCountdown = formatLockCountdown(now, LEAGUE_CONFIG);

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <header className="border-b border-stone-800 bg-stone-950 text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase text-amber-300">
                Lander&apos;s League Loser Bowl
              </p>
              <h1 className="text-4xl font-black">{pageTitle(data)}</h1>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-1 sm:text-right">
              <StatusPill label="Season" value={String(LEAGUE_CONFIG.season)} />
              <StatusPill
                label="Lock"
                value={lockCountdown}
                detail={formatConfigDate(LEAGUE_CONFIG.bracketLockDate)}
              />
            </div>
          </div>
          <div className="grid gap-3 border-t border-stone-700 pt-4 text-sm text-stone-200 sm:grid-cols-3">
            <div>
              <span className="font-semibold text-white">Drop zone</span>{" "}
              seeds 9-16
            </div>
            <div>
              <span className="font-semibold text-white">Bowl weeks</span>{" "}
              {LEAGUE_CONFIG.rounds.map((round) => round.week).join(", ")}
            </div>
            <div>
              <span className="font-semibold text-white">Updated</span>{" "}
              {updatedAgo}
            </div>
          </div>
        </div>
      </header>

      <main>
        {data.status === "awaiting" ? (
          <AwaitingLeagueData />
        ) : data.phase === "race" ? (
          <RaceView data={data} />
        ) : data.phase === "champion" ? (
          <ChampionView data={data} />
        ) : (
          <BracketView id="full-bracket" matchups={data.matchups} />
        )}
      </main>

      <YahooFooter />
    </div>
  );
}

function RaceView({ data }: { data: Extract<LeagueData, { status: "ready" }> }) {
  const pairings = getProjectedRoundOnePairings(data.teams);

  return (
    <>
      <section className="border-b border-stone-300 bg-stone-100">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-rose-800">
                The Drop Zone
              </p>
              <h2 className="text-2xl font-black text-stone-950">
                Current Standings
              </h2>
            </div>
          </div>
          <StandingsTable teams={data.teams} />
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4">
            <p className="text-sm font-semibold uppercase text-amber-700">
              Projected bracket
            </p>
            <h2 className="text-2xl font-black text-stone-950">
              Round 1 Pairings
            </h2>
          </div>
          <ProjectedPairings pairings={pairings} />
        </div>
      </section>
    </>
  );
}

function ChampionView({
  data,
}: {
  data: Extract<LeagueData, { status: "ready" }>;
}) {
  const finalSlot = buildBracketSlots(data.matchups).find(
    (slot) => slot.id === "final",
  );
  const champion = finalSlot ? effectiveWinner(finalSlot) : null;

  return (
    <>
      <section className="border-b border-stone-800 bg-stone-950 text-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="border-y-4 border-amber-300 py-8">
            <p className="text-sm font-black uppercase text-amber-300">
              Lander&apos;s League Loser Bowl Champion
            </p>
            <h2 className="mt-3 text-5xl font-black tracking-normal sm:text-6xl">
              {champion?.name ?? "Champion pending"}
            </h2>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <span className="border border-stone-600 px-3 py-2 font-mono font-black text-stone-100">
                {champion?.finalSeed === null || champion === null
                  ? "Seed TBD"
                  : `Seed ${champion.finalSeed}`}
              </span>
              <span className="border border-amber-300 bg-amber-300 px-3 py-2 font-black uppercase text-stone-950">
                Final settled
              </span>
            </div>
            <a
              href="#full-bracket"
              className="mt-6 inline-flex border border-white px-4 py-3 text-sm font-black uppercase text-white hover:border-amber-300 hover:text-amber-300"
            >
              View the full bracket
            </a>
          </div>
        </div>
      </section>

      <BracketView
        id="full-bracket"
        matchups={data.matchups}
        title="Full Bracket"
      />
    </>
  );
}

function StatusPill({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="border border-stone-700 px-3 py-2">
      <div className="text-xs font-semibold uppercase text-stone-400">
        {label}
      </div>
      <div className="font-mono text-sm font-semibold text-white">{value}</div>
      {detail ? (
        <div className="mt-1 text-xs font-medium text-stone-400">{detail}</div>
      ) : null}
    </div>
  );
}

function AwaitingLeagueData() {
  return (
    <section className="bg-stone-100">
      <div className="mx-auto flex min-h-[52vh] w-full max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="w-full border border-dashed border-stone-400 bg-white px-5 py-10 text-center">
          <p className="mb-2 text-sm font-semibold uppercase text-rose-800">
            Awaiting league data
          </p>
          <h2 className="text-2xl font-black text-stone-950">
            Standings have not landed yet.
          </h2>
        </div>
      </div>
    </section>
  );
}

export function YahooFooter() {
  return (
    <footer className="border-t border-stone-300 bg-stone-950 px-4 py-5 text-center text-sm text-stone-300">
      Fantasy data provided by{" "}
      <a
        href="https://sports.yahoo.com/fantasy/"
        className="font-semibold text-white underline decoration-stone-500 underline-offset-4 hover:decoration-white"
      >
        Yahoo Fantasy
      </a>
    </footer>
  );
}
