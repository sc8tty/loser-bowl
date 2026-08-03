import { LEAGUE_CONFIG } from "@/config/league";
import {
  type AdminDashboardData,
  type AdminMatchup,
  type AdminSyncRun,
  type AdminSyncState,
  type AdminTeamRef,
  getAdminDashboardData,
} from "@/lib/admin/dashboard";
import { requireAdminPage } from "@/lib/admin/guard";
import {
  canRenderMatchupSettleControl,
  canRenderSeedLockSettleControl,
} from "@/lib/admin/state";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AdminPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pageMessage(type: "notice" | "error", value: string | undefined): string | null {
  const messages: Record<string, string> = {
    sync_started: "Admin sync completed successfully.",
    sync_skipped: "Sync did not run because another sync holds the lock.",
    override_saved: "Matchup override saved.",
    matchup_settled: "Matchup settled.",
    matchup_window_open: "Correction window is still open; matchup stayed provisional.",
    matchup_confirmed: "Original matchup result confirmed.",
    seed_lock_settled: "Seed lock settled.",
    seed_lock_window_open: "Correction window is still open; seed lock stayed provisional.",
    seed_lock_confirmed: "Original seed lock confirmed.",
    seed_lock_relocked: "Current seed snapshot settled.",
    csrf: "Mutation rejected by the Origin check.",
    invalid: "Submitted admin form data was invalid.",
    missing_matchup: "That matchup does not exist.",
    invalid_winner: "Override winner must be one of the matchup teams.",
    invalid_state: "That action is not available for the current state.",
    missing_lock_time: "That state is missing its lock timestamp.",
    sync_error: "Admin sync failed. Check the sync log for details.",
    database: "Database is not available for that admin action.",
  };

  if (value === undefined) {
    return null;
  }

  return messages[value] ?? `${type}: ${value}`;
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

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) {
    return "-";
  }

  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  return `${(durationMs / 1000).toFixed(1)} s`;
}

function formatJson(value: Record<string, unknown> | null): string {
  if (value === null || Object.keys(value).length === 0) {
    return "-";
  }

  const json = JSON.stringify(value);

  return json.length > 160 ? `${json.slice(0, 157)}...` : json;
}

function teamLabel(team: AdminTeamRef | null): string {
  if (team === null) {
    return "TBD";
  }

  return team.finalSeed === null
    ? `${team.name} (#${team.currentRank})`
    : `${team.name} (seed ${team.finalSeed})`;
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "success" || status === "final" || status === "settled"
      ? "border-emerald-700 bg-emerald-50 text-emerald-900"
      : status === "error" || status === "under_review"
        ? "border-rose-700 bg-rose-50 text-rose-900"
        : status === "provisional" || status === "running"
          ? "border-amber-600 bg-amber-50 text-amber-900"
          : "border-stone-400 bg-stone-50 text-stone-700";

  return (
    <span className={`inline-flex border px-2 py-1 text-xs font-black uppercase ${className}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  await requireAdminPage();

  const params = await searchParams;
  const data = await getAdminDashboardData();
  const notice = pageMessage("notice", firstParam(params.notice));
  const error = pageMessage("error", firstParam(params.error));

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <header className="border-b border-stone-800 bg-stone-950 text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase text-amber-300">
                Lander&apos;s League Loser Bowl
              </p>
              <h1 className="text-4xl font-black">Admin</h1>
            </div>
            <form action="/api/admin/logout" method="post">
              <button
                type="submit"
                className="border border-stone-500 px-3 py-2 text-sm font-black uppercase text-white hover:border-white"
              >
                Sign out
              </button>
            </form>
          </div>
          <div className="grid gap-3 border-t border-stone-700 pt-4 text-sm text-stone-200 sm:grid-cols-3">
            <div>
              <span className="font-semibold text-white">Season</span>{" "}
              {LEAGUE_CONFIG.season}
            </div>
            <div>
              <span className="font-semibold text-white">League</span>{" "}
              {LEAGUE_CONFIG.leagueKey ?? "not set"}
            </div>
            <div>
              <span className="font-semibold text-white">Timezone</span>{" "}
              {LEAGUE_CONFIG.timeZone}
            </div>
          </div>
        </div>
      </header>

      <main>
        {notice ? <MessageBanner tone="notice" message={notice} /> : null}
        {error ? <MessageBanner tone="error" message={error} /> : null}
        {data.status === "awaiting" ? (
          <AwaitingAdminData data={data} />
        ) : (
          <>
            <SyncSection syncRuns={data.syncRuns} syncState={data.syncState} />
            <BackfillSection />
            <SeedLockSection syncState={data.syncState} />
            <MatchupsSection matchups={data.matchups} />
            <YahooHealthSection />
          </>
        )}
      </main>
    </div>
  );
}

function MessageBanner({
  tone,
  message,
}: {
  tone: "notice" | "error";
  message: string;
}) {
  const className =
    tone === "notice"
      ? "border-amber-300 bg-amber-50 text-amber-950"
      : "border-rose-300 bg-rose-50 text-rose-950";

  return (
    <div className={`border-b ${className}`}>
      <div className="mx-auto w-full max-w-6xl px-4 py-3 text-sm font-semibold sm:px-6 lg:px-8">
        {message}
      </div>
    </div>
  );
}

function AwaitingAdminData({ data }: { data: Extract<AdminDashboardData, { status: "awaiting" }> }) {
  return (
    <section className="bg-stone-100">
      <div className="mx-auto flex min-h-[52vh] w-full max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="w-full border border-dashed border-stone-400 bg-white px-5 py-10 text-center">
          <p className="mb-2 text-sm font-semibold uppercase text-rose-800">
            Awaiting admin data
          </p>
          <h2 className="text-2xl font-black text-stone-950">{data.reason}</h2>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-semibold uppercase text-rose-800">{eyebrow}</p>
        <h2 className="text-2xl font-black text-stone-950">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function SyncSection({
  syncRuns,
  syncState,
}: {
  syncRuns: AdminSyncRun[];
  syncState: AdminSyncState | null;
}) {
  return (
    <section className="border-b border-stone-300 bg-stone-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Sync"
          title="Status Log"
          action={
            <form action="/api/admin/sync" method="post">
              <button
                type="submit"
                className="border border-stone-950 bg-stone-950 px-4 py-3 text-sm font-black uppercase text-white hover:bg-rose-900"
              >
                Re-sync now
              </button>
            </form>
          }
        />
        <div className="mb-5 grid gap-3 text-sm sm:grid-cols-4">
          <Metric label="Last attempt" value={formatDateTime(syncState?.lastAttempt ?? null)} />
          <Metric label="Last success" value={formatDateTime(syncState?.lastSuccess ?? null)} />
          <Metric label="Retry after" value={formatDateTime(syncState?.nextRetryAt ?? null)} />
          <Metric label="Lock expires" value={formatDateTime(syncState?.lockExpiresAt ?? null)} />
        </div>
        {syncRuns.length === 0 ? (
          <EmptyState label="No sync runs have been logged yet." />
        ) : (
          <div className="overflow-hidden border border-stone-300 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="bg-stone-100 text-xs font-semibold uppercase text-stone-600">
                  <tr>
                    <th scope="col" className="px-4 py-3">Run</th>
                    <th scope="col" className="px-4 py-3">Trigger</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3">Started</th>
                    <th scope="col" className="px-4 py-3">Duration</th>
                    <th scope="col" className="min-w-64 px-4 py-3">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {syncRuns.map((run) => (
                    <tr key={run.id} className="bg-white">
                      <td className="px-4 py-3 font-mono text-sm font-semibold text-stone-700">
                        {run.id}
                      </td>
                      <td className="px-4 py-3 font-semibold">{run.trigger}</td>
                      <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
                      <td className="px-4 py-3">{formatDateTime(run.startedAt)}</td>
                      <td className="px-4 py-3 font-mono text-sm">{formatDuration(run.durationMs)}</td>
                      <td className="px-4 py-3 text-stone-700">
                        {run.error ?? formatJson(run.detail)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-stone-300 bg-white px-3 py-3">
      <div className="text-xs font-semibold uppercase text-stone-500">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold text-stone-950">{value}</div>
    </div>
  );
}

function BackfillSection() {
  return (
    <section className="border-b border-stone-300 bg-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Backfill" title="Season Backfill" />
        <div className="border border-dashed border-stone-400 bg-stone-50 px-4 py-5">
          <p className="mb-3 text-sm font-semibold text-stone-800">
            Chunked admin backfill is not wired yet. The canonical path remains
            the local script planned for the Yahoo backfill issue.
          </p>
          <button
            type="button"
            disabled
            className="cursor-not-allowed border border-stone-300 bg-stone-200 px-4 py-3 text-sm font-black uppercase text-stone-500"
          >
            Backfill not available
          </button>
        </div>
      </div>
    </section>
  );
}

function SeedLockSection({ syncState }: { syncState: AdminSyncState | null }) {
  const status = syncState?.seedLockStatus ?? "none";

  return (
    <section className="border-b border-stone-300 bg-stone-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Seeds" title="Seed Lock" />
        <div className="border border-stone-300 bg-white px-4 py-5">
          <div className="mb-4 grid gap-3 text-sm sm:grid-cols-3">
            <Metric label="Status" value={status.replaceAll("_", " ")} />
            <Metric label="Locked" value={formatDateTime(syncState?.seedsLockedAt ?? null)} />
            <Metric label="Settled" value={formatDateTime(syncState?.seedsSettledAt ?? null)} />
          </div>
          {syncState === null ? (
            <EmptyState label="No sync_state row exists yet." />
          ) : canRenderSeedLockSettleControl(syncState.seedLockStatus) ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              {syncState.seedLockStatus === "provisional" ? (
                <form action="/api/admin/seed-lock/settle" method="post">
                  <input type="hidden" name="action" value="settle_provisional" />
                  <button
                    type="submit"
                    className="border border-stone-950 bg-stone-950 px-4 py-3 text-sm font-black uppercase text-white hover:bg-rose-900"
                  >
                    Run settle check
                  </button>
                </form>
              ) : null}
              {syncState.seedLockStatus === "under_review" ? (
                <>
                  <form action="/api/admin/seed-lock/settle" method="post">
                    <input type="hidden" name="action" value="confirm_original" />
                    <button
                      type="submit"
                      className="border border-stone-950 bg-stone-950 px-4 py-3 text-sm font-black uppercase text-white hover:bg-rose-900"
                    >
                      Confirm original seeds
                    </button>
                  </form>
                  <form action="/api/admin/seed-lock/settle" method="post">
                    <input type="hidden" name="action" value="relock_corrected" />
                    <button
                      type="submit"
                      className="border border-amber-700 bg-amber-50 px-4 py-3 text-sm font-black uppercase text-amber-950 hover:bg-amber-100"
                    >
                      Settle current snapshot
                    </button>
                  </form>
                </>
              ) : null}
            </div>
          ) : (
            <p className="text-sm font-semibold text-stone-700">
              No seed lock action is available for this state.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function MatchupsSection({ matchups }: { matchups: AdminMatchup[] }) {
  return (
    <section className="border-b border-stone-300 bg-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Matchups" title="Result Overrides" />
        {matchups.length === 0 ? (
          <EmptyState label="No bracket matchups exist yet. Override and settle controls will appear here once Issue 8 creates the bracket." />
        ) : (
          <div className="grid gap-4">
            {matchups.map((matchup) => (
              <MatchupCard key={matchup.id} matchup={matchup} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function MatchupCard({ matchup }: { matchup: AdminMatchup }) {
  const teams = [matchup.highTeam, matchup.lowTeam].filter(
    (team): team is AdminTeamRef => team !== null,
  );
  const canOverride = teams.length === 2;
  const effectiveWinner = matchup.overrideWinner ?? matchup.computedWinner;

  return (
    <article className="border border-stone-300 bg-stone-50">
      <div className="border-b border-stone-300 bg-white px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-black uppercase text-stone-600">
                {matchup.id}
              </span>
              <StatusBadge status={matchup.status} />
            </div>
            <h3 className="text-xl font-black">
              R{matchup.round}, week {matchup.week}
            </h3>
            <p className="mt-1 text-sm font-semibold text-stone-700">
              {teamLabel(matchup.highTeam)} vs {teamLabel(matchup.lowTeam)}
            </p>
          </div>
          <div className="text-sm sm:text-right">
            <div className="font-semibold text-stone-500">Effective winner</div>
            <div className="font-black text-stone-950">{teamLabel(effectiveWinner)}</div>
          </div>
        </div>
      </div>
      <div className="grid gap-4 px-4 py-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-3 text-sm">
          <Fact label="Computed winner" value={teamLabel(matchup.computedWinner)} />
          <Fact label="Decided by" value={matchup.decidedBy ?? "-"} />
          <Fact label="Locked" value={formatDateTime(matchup.lockedAt)} />
          <Fact label="Settled" value={formatDateTime(matchup.settledAt)} />
          <Fact label="Tally" value={formatJson(matchup.computedTally)} />
          {matchup.overrideWinner ? (
            <div className="border border-amber-300 bg-amber-50 px-3 py-3">
              <div className="text-xs font-black uppercase text-amber-900">
                Override provenance
              </div>
              <div className="mt-1 font-semibold text-amber-950">
                Winner: {teamLabel(matchup.overrideWinner)}
              </div>
              <div className="mt-1 text-amber-950">{matchup.overrideNote}</div>
              <div className="mt-2 font-mono text-xs text-amber-900">
                {formatDateTime(matchup.overriddenAt)}
              </div>
            </div>
          ) : null}
        </div>
        <div className="space-y-4">
          {canOverride ? (
            <form action="/api/admin/matchups/override" method="post" className="space-y-3">
              <input type="hidden" name="matchupId" value={matchup.id} />
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-stone-700">
                  Override winner
                </span>
                <select
                  name="winnerTeamId"
                  required
                  defaultValue={matchup.overrideWinner?.id ?? matchup.computedWinner?.id ?? teams[0]?.id}
                  className="w-full border border-stone-400 bg-white px-3 py-3 text-sm font-semibold text-stone-950"
                >
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {teamLabel(team)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-stone-700">
                  Required note
                </span>
                <textarea
                  name="overrideNote"
                  required
                  minLength={1}
                  rows={3}
                  defaultValue={matchup.overrideNote ?? ""}
                  className="w-full border border-stone-400 bg-white px-3 py-3 text-sm text-stone-950"
                />
              </label>
              <button
                type="submit"
                className="border border-stone-950 bg-stone-950 px-4 py-3 text-sm font-black uppercase text-white hover:bg-rose-900"
              >
                Save override
              </button>
            </form>
          ) : (
            <EmptyState label="Both matchup teams must be known before an override can be saved." />
          )}
          {canRenderMatchupSettleControl(matchup.status) ? (
            <div className="border-t border-stone-300 pt-4">
              {matchup.status === "provisional" ? (
                <form action="/api/admin/matchups/settle" method="post">
                  <input type="hidden" name="matchupId" value={matchup.id} />
                  <input type="hidden" name="action" value="settle_provisional" />
                  <button
                    type="submit"
                    className="border border-amber-700 bg-amber-50 px-4 py-3 text-sm font-black uppercase text-amber-950 hover:bg-amber-100"
                  >
                    Run settle check
                  </button>
                </form>
              ) : null}
              {matchup.status === "under_review" ? (
                <form action="/api/admin/matchups/settle" method="post">
                  <input type="hidden" name="matchupId" value={matchup.id} />
                  <input type="hidden" name="action" value="confirm_original" />
                  <button
                    type="submit"
                    className="border border-rose-800 bg-rose-50 px-4 py-3 text-sm font-black uppercase text-rose-950 hover:bg-rose-100"
                  >
                    Confirm original
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-black uppercase text-stone-500">{label}</div>
      <div className="mt-1 break-words font-mono text-sm text-stone-800">{value}</div>
    </div>
  );
}

function YahooHealthSection() {
  return (
    <section className="bg-stone-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Yahoo" title="Connection Health" />
        <div className="border border-rose-300 bg-rose-50 px-4 py-5">
          <StatusBadge status="under_review" />
          <p className="mt-3 text-sm font-semibold text-rose-950">
            Yahoo not connected - OAuth is not configured yet. No re-auth link is
            available until the OAuth bootstrap route ships.
          </p>
        </div>
      </div>
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="border border-dashed border-stone-400 bg-white px-4 py-5 text-sm font-semibold text-stone-600">
      {label}
    </div>
  );
}
