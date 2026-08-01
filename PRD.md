# Lander's League Loser Bowl — PRD + Build Plan

> **Status:** Final (rev 6). Six external review rounds complete; loop closed by mutual
> agreement — see [docs/review-log.md](docs/review-log.md). Next reviewer is the Issue 3
> spike. This is a **destination document**: decisions below are interview-settled and
> review-hardened. Do not relitigate them in implementation sessions; if reality
> contradicts the document, update the document.

## Context

Scott's 16-team Yahoo fantasy baseball league (H2H categories, 8 playoff spots) is adding
**Lander's League Loser Bowl** — a toilet-bowl-style consolation bracket for the 8 teams
that miss the playoffs. $50 winner-take-all, handled off-site. Yahoo has no support for
this (confirmed: with an 8-team playoff there is no consolation bracket at all, and no
loser-bracket format exists anywhere in Yahoo). So we build a small, public, read-only web
product managers check from the group chat.

**URL:** loserbowl.landermedia.com (Porkbun CNAME → Vercel) · **Repo:** sc8tty/loser-bowl
at `~/Development/loser-bowl` · **Deadline:** bracket locks Sun Sept 6, 2026; rounds run
Sept 7–13, 14–20, 21–27.

## Product spec (interview-settled)

**Bracket rules**
- Seeds 9–16 by final regular-season standings. Winners advance; champion takes the $50.
- Round 1: 9v16, 10v15, 11v14, 12v13. **Re-seed each round** (highest remaining seed plays
  lowest) — so bracket UI must not draw fixed connector lines; semifinal slots stay
  placeholder until round 1 resolves.
- Matchup winner = more category wins that week, computed by us from each team's weekly team
  stats (Yahoo schedules no matchups for these teams). Tied categories count for neither side
  (a 10-cat week can end 5–4–1: the 5 wins it).
- **Innings minimum:** if the league sets a weekly minimum innings pitched (common in Yahoo
  baseball), our comparator must replicate Yahoo's forfeiture behavior for pitching
  categories when a team falls short. The setting is snapshotted from league settings and
  asserted; Yahoo's exact forfeiture semantics get verified in the spike (Issue 3) against
  a real 2025 week; tests cover one-team-below and both-teams-below cases. (If the league
  has no minimum, the rule compiles to a no-op — but we find that out from settings, not
  assumption.)
- 3 rounds mirror Yahoo's playoff weeks exactly.

**Tiebreakers — worked spec (canonical sources explicit).** If a bowl week ends with equal
category wins (5–5, or 4–4–2):
1. **Season head-to-head series** — who won more of the teams' regular-season Yahoo matchups.
   Canonical: Yahoo's own `winner_team_key` per matchup (what managers see in league history).
   Teams may have met once or twice in a 22-week/16-team schedule; a 1–1 split, a single tied
   meeting, or zero meetings all fall through to #2.
2. **Season total category wins** — each team's regular-season category W total. Canonical:
   Yahoo standings `outcome_totals` (again, Yahoo's published number). Tie falls through.
3. **Higher seed advances.** Deterministic terminus.

Our own category comparator is canonical **only** for Loser Bowl matchups (Yahoo doesn't
score those); for anything Yahoo already adjudicated, Yahoo's numbers win disputes.

**Experience**
- **Public link, no viewer auth. Read-only.** No money mentioned anywhere. Sitewide
  `noindex` — it's a group-chat product; public-by-link, not public-by-search.
- Phase-aware home: **Race to the Bottom** (now → Sept 6: standings with the 9–16 "drop
  zone" highlighted, projected R1 pairings, lock countdown) → **Bracket** (live category
  tallies, matchup links) → **Champion** (celebration takeover — the one approved flourish).
  (View names are working copy — Scott's design pass owns final naming.)
- Matchup detail: full stat lines per category (HR 8–5, ERA 3.21–4.10), running tally,
  tiebreak/override/provisional explanation line. Not player-level.
- Live-ish freshness during bracket weeks (~30 min), daily during the Race.
- Tone: clean sports UI with a wink. Mobile-first (375px primary). No OG images, no extra
  polish pass (descoped).

**Admin (Scott only)**
- One password-gated page: sync status log, "re-sync now", season backfill, matchup result
  override (note required, provenance shown publicly), settle/confirm controls for flagged
  provisional results, Yahoo connection health + re-auth link.

**Lifespan:** config-for-reuse — league key, season, playoff weeks/dates in
`src/config/league.ts` + env; next season is a repoint. No multi-league UI, no archives.

## Yahoo API access — gated critical path

- **Day one:** attempt classic self-serve app creation (developer.yahoo.com/apps/create,
  Fantasy Sports → Read). Yahoo also runs a newer "apply for access" review flow; do not
  assume same-day success.
- **Decision date: Mon Aug 17** (3 weeks before lock). No working API credentials by then →
  pivot to manual mode.
- **Fallback is designed-in, activatable in an hour, and owes Yahoo nothing:** the bracket
  engine and all UI read `stat_lines` + `teams` from Postgres keyed by **internal team ids**
  (stable slugs; `teams.yahoo_team_key` is nullable) and never know the source (`source`
  enum: `yahoo | manual | import`). League settings are equally source-agnostic: the
  `league_settings` snapshot can be **seeded from a checked-in config** (Scott transcribes
  the league's categories + innings minimum — he knows them) instead of the API. The import
  path is built **early** (Issue 6A, not gate-failure day): CSV, one row per team-week,
  `team_id, week` + one column per category keyed by `stat_id` with friendly header aliases,
  zod-validated against the settings snapshot — plus `scripts/import-stats.ts` and
  `scripts/import-standings.ts` (validated, `--dry-run`, idempotent, `sync_runs`-logged,
  committed). **The CSV carries support stats, not just scoring categories,** with distinct
  slugs so batting and pitching components never conflate: `at_bats` + `batting_hits` (AVG);
  `earned_runs_allowed` + `innings_pitched` (ERA); `hits_allowed` + `walks_allowed` +
  `innings_pitched` (WHIP — allowed, NOT batting, stats); `innings_pitched` always present
  for the minimum-IP check even when unscored. The settings snapshot declares which support
  columns are required. **Tiebreaker data has a manual path too** —
  `scripts/import-regular-season-matchups.ts` (week, team_a, team_b, winner-or-tied)
  feeds tiebreaker #1, and the standings import carries category `outcome_totals` for
  tiebreaker #2; without these, manual mode would fail in exactly the matchups that need
  adjudication. Gate failure = Scott fills spreadsheets weekly and runs scripts; only the
  optional admin form wrapper waits for actual failure.

## Technical design

**Stack:** Next.js 15 App Router on Vercel **Hobby**, Neon Postgres (us-east, co-located) +
Drizzle, Tailwind. Hand-rolled Yahoo client (~250 lines) — 6 endpoints; npm wrappers add more
surface than they save. Crib response shapes from yfpy/yahoofantasy.

**Yahoo API facts (researched):**
- OAuth2 auth-code flow; redirect URI must be HTTPS →
  `https://loserbowl.landermedia.com/api/oauth/callback`. Access tokens last 1 hour; treat
  refresh tokens as **rotating** (persist whatever comes back on every `get_token`,
  atomically); include `redirect_uri` in refresh requests (known quirk). Scott OAuths
  **once** via an admin-gated bootstrap route; tokens in a single DB row.
- A league member's token reads the whole private league — Scott's suffices for all 16 teams.
- Endpoints: league discovery (`users;use_login=1/games;game_codes=mlb;seasons=2026/leagues`),
  `league/{key}/settings` (stat categories, `sort_order` for ERA/WHIP inversion,
  `playoff_start_week` assertion), `league/{key}/standings`, batch
  `teams;team_keys=k1,...,k8/stats;type=week;week=N`, `league/{key}/scoreboard;week=N`.
  Always `?format=json` + a `flattenYahoo()` normalizer — Yahoo's JSON is XML translated
  literally (numeric-keyed pseudo-arrays, `count` fields); normalizer + recorded fixtures is
  80% of the client work.
- Stat values are strings (IP `.1`/`.2` = thirds; `H/AB` composite); ratio cats come back
  computed in weekly team stats.
- Rate limits undocumented but irrelevant at our volume (~6 calls/sync); serialize calls,
  single-flight lock, error-999 → log + back off via `sync_state.next_retry_at`.

**Load-bearing assumption + spike:** do eliminated teams still accrue weekly team stats
during playoff weeks? Strong precedent says yes (no documented roster lock; a prior
open-source Yahoo consolation-bracket project pulled exactly this data). **Issue 3 proves it
against Scott's actual 2025 league** (Yahoo serves historical seasons through the same API):
(a) 2025 playoff-week weekly stats for last year's seeds 9–16 are non-zero with ratio cats
present, (b) batch `team_keys` call works, (c) **the fallback path is proven too** — daily
`stats;type=date` provides each of the six support stats the importer schema requires, as
distinct values: `at_bats`, `batting_hits`, `earned_runs_allowed`, `hits_allowed`,
`walks_allowed`, `innings_pitched` — so the spike proves exactly the slugs the fallback
consumes, including that pitching hits/walks allowed are separately available from their
batting counterparts. An unproven fallback isn't a fallback. Residual league-ops risk:
eliminated managers must keep setting lineups — the site is the incentive; Scott nudges
the chat.

**Schema (8 small tables):**
- `oauth_tokens` (1 row: access/refresh/expires_at/scope/updated_at)
- `league_settings` (1 row per season: stat_categories jsonb snapshot — each category an
  **internal stat slug** (`hr`, `era`, …) with display_name, sort_order,
  is_only_display_stat, required support stats, and **nullable `yahoo_stat_id`**;
  `min_innings_pitched`; playoff_start_week; `source` 'yahoo' | 'seed' — fetched from API
  **or** seeded from checked-in config; versioned, asserted at sync)
- `teams` (16 rows; PK = internal stable slug `id`; `yahoo_team_key` **nullable** unique;
  `current_rank` drives the Race; `final_seed` 9–16 set at lock;
  `regular_season_outcome_totals` jsonb — the tiebreaker-#2 number stored explicitly,
  Yahoo-synced or imported)
- `stat_lines` (keyed by internal `team_id`×week, stats jsonb keyed by stat slug with the
  normalized Yahoo payload preserved (this IS the raw provenance for bowl disputes),
  `source` 'yahoo' | 'manual' | 'import', `sync_run_id` FK for traceability, synced_at;
  UNIQUE(team_id, week)) ← **the source-agnostic seam**
- `matchups` (7 rows r1m1–final: round, week, `high_team_id`/`low_team_id` internal FKs
  (NULL until populated), status 'pending'|'live'|'provisional'|'under_review'|'final',
  computed tally/winner/decided_by, `locked_at`, `settled_at`, non-destructive
  `override_winner_team_id` + `override_note` + `overridden_at` — **Yahoo keys appear
  nowhere in bracket state; they live only on `teams` as external IDs**)
- `regular_season_matchups` (tiebreaker source: week, internal team ids,
  `winner_team_id` (NULL = tied; canonical = Yahoo's result when Yahoo-sourced), our
  cat-win counts as cross-check, `source` 'yahoo' | 'import', `raw` jsonb — normalized
  Yahoo matchup snapshot when API-sourced; UNIQUE(week, a, b))
- `sync_state` (1 row: last_attempt/last_success, `lock_expires_at` (atomic lock),
  `next_retry_at` (failure backoff), and the seed-lock review state made storable:
  `seed_lock_status` 'none'|'provisional'|'under_review'|'settled', `seeds_locked_at`,
  `seeds_settled_at`, `seeds_snapshot` jsonb (standings payload at lock, for
  dispute/correction comparison))
- `sync_runs` (audit: trigger 'visit'|'cron'|'admin'|'backfill', status, timings, error, detail)

No `bracket_state` table — phase is a pure function of date + config + the final matchup's
**status and** effective winner: champion celebration triggers only when the final is
status `final` (settled) with an effective winner (`COALESCE(override, computed)`). A
provisional or under-review final renders the bracket with its normal
provisional/review badging — no premature confetti.

**Sync (Vercel Hobby-shaped, explicit):**
- Data pages are **explicitly dynamic** (`export const dynamic = 'force-dynamic'`) and read
  Neon directly; every page calls one `getLeagueData()` which, when data is staler than the
  phase window (30 min bracket / 6 h race / never post-champion) and `next_retry_at` has
  passed, schedules a post-response sync via `after()` and renders instantly from Postgres.
  **`after()` inherits the duration budget of the route that invokes it** (per Next.js docs)
  — so `maxDuration` is set on the pages that call `getLeagueData()` (home, matchup), not
  just `/api/sync`. A sync is 3–6 serialized Yahoo calls, well inside limits either way.
  All phase-boundary dates evaluate in an explicit league timezone
  (`America/Los_Angeles`, in config); Vercel function region pinned to `iad1` co-located
  with the Neon us-east branch.
- Atomic lock claim (`UPDATE sync_state SET lock_expires_at = now()+'2 min' WHERE id=1 AND
  (lock_expires_at IS NULL OR lock_expires_at < now()) RETURNING id`) — concurrency guard and
  stampede limit in one statement; at most 1 Yahoo sync per window regardless of traffic.
- Daily cron backstop: `vercel.json` cron → GET `/api/sync` guarded by `CRON_SECRET`
  (Hobby cron timing is approximate — fine for a backstop).
- **Round finalization = provisional advancement:** Sunday night close → compute winner →
  status `provisional` → **immediately** populate next round's pairings via re-seed using
  effective winners (next round starts Monday; no UI delay). After a 24 h correction window
  a sync re-verifies stats: unchanged → `final` + `settled_at`. Changed but winner holds →
  update tallies, settle. **Winner flips → do NOT auto-rewire.** Exact freeze semantics:
  the affected matchup goes `under_review` (frozen — no further recompute), a public banner
  appears on the bracket and that matchup page, the downstream next-round matchup it fed
  displays a "commissioner review" badge, and sync **pauses finalization/advancement on
  that branch only** (stat collection continues everywhere). Admin must resolve — confirm
  the original result or override to the corrected one — before that branch settles and
  advancement resumes. Rewiring a started round is a commissioner call, not an automation.
- **Seed lock gets the same policy as round corrections:** seeds and R1 pairings lock
  provisionally Sun Sept 6 close and settle after the same 24 h correction window. If a
  Yahoo standings correction changes the 9–16 field or ordering inside that window, the
  bracket enters the same freeze state (public banner, commissioner resolves — re-lock with
  corrected seeds or confirm the originals). Once settled, seeds are immutable for the
  season; later standings changes are ignored by design.
- **Backfill** (weeks 1..22 scoreboard → `regular_season_matchups`): run as a **local script**
  (`scripts/backfill.ts` against prod Neon) — one-time job, sidesteps serverless duration
  limits entirely; the admin button variant is chunked (≤6 weeks per invocation, resumable,
  idempotent upserts) if we want it.

**Security (in the build, not deferred to a hardening pass):**
- Secrets only in Vercel env (`YAHOO_CLIENT_ID/SECRET`, `DATABASE_URL`,
  `ADMIN_PASSWORD_HASH` (bcrypt — never the plaintext), `ADMIN_SESSION_SECRET`,
  `CRON_SECRET`); `server-only` imports on Yahoo/DB modules; nothing `NEXT_PUBLIC_*`.
- Tokens plaintext in Neon (read-only `fspt-r` scope, Neon encrypts at rest; app-layer crypto
  adds a key-management failure mode for ~no risk reduction — this rationale is the
  documented decision).
- Admin: bcrypt verify → HMAC-signed `HttpOnly; Secure; SameSite=Strict` cookie (7-day);
  **CSRF from day one** = SameSite=Strict + Origin-header check on all admin POSTs; login
  throttled per-IP; middleware guards `/admin/*` + admin APIs.
- OAuth callback validates a `state` nonce carried in a **short-lived SameSite=Lax** HttpOnly
  cookie — the redirect back from Yahoo is a cross-site navigation, so a Strict cookie would
  not be sent on the callback; only the admin session cookie is Strict. Overrides
  zod-validated (known matchup ids, note required). Sitewide `X-Robots-Tag: noindex`.
  Dependabot on.
- **Yahoo attribution:** small footer source line ("League data: Yahoo Fantasy Sports") per
  the Fantasy API branding requirements — "no money on the site" never meant "no
  attribution."

## Task graph (GitHub Issues on sc8tty/loser-bowl, "Blocked by #N")

Vertical slices; Issue 1A is the tracer bullet. `[M]` = Scott manual. `∥` = parallel-safe.

- **0A `[M]` — GATE: Yahoo dev app** (day one; decision date **Aug 17** → manual-mode pivot)
  · **0B `[M]` ∥** Provision Neon + Vercel projects
- **1A — Tracer bullet, Yahoo-free** (blocked by 0B only — **the tracer no longer waits on
  Yahoo access**): scaffold + Drizzle migrations (internal team ids) + seeded
  `league_settings` + fixture standings import + home page showing standings **on the
  production URL** (Postgres → server component, deployed, dynamic rendering + `maxDuration`
  explicit).
- **1B — Yahoo wiring** (blocked by 0A, 1A): hand-rolled client + `flattenYahoo()`
  normalizer (fixture-based unit tests) + OAuth bootstrap (Lax state cookie) + live
  standings sync replacing the fixture data end-to-end.
- **2 `[M]` ∥** Porkbun CNAME (`loserbowl` → `cname.vercel-dns.com`) + Vercel domain + OAuth
  redirect-URI check (blocked by 0B) · **3 ∥** Spike vs Scott's 2025 league (blocked by 1B):
  eliminated-team weekly stats **and** daily-stats fallback components, batch call, value
  formats, **innings-minimum forfeiture semantics on a real 2025 week** → fixtures +
  `docs/yahoo-notes.md` · **4A ∥** Freshness/state shell, Yahoo-free (blocked by 1A):
  atomic lock claim, `next_retry_at` backoff, `sync_runs` audit, phase-aware freshness
  windows, `after()` visit-trigger plumbing, cron route shell — the sync *machinery* with a
  pluggable source; AC: two simultaneous cold visits = exactly one source invocation ·
  **4B** Yahoo sync engine plugged into the shell (blocked by 1B, 4A) · **5 ∥** Pure
  bracket engine (blocked by 1A — fixture-driven, no Yahoo needed), **test-first**:
  comparator w/ `sort_order` + tie cats + **innings-minimum rule (one/both teams below)**,
  tiebreaker chain w/ canonical-source inputs, re-seed permutations,
  provisional/settle/freeze state machine (rounds AND seed lock), phase fn, IP/ratio
  parsers — exhaustive vitest
- **6A ∥ — Import scripts, Yahoo-free** (blocked by 1A only — **the fallback path has zero
  Yahoo dependency anywhere in its ancestry**): `import-stats.ts`, `import-standings.ts`
  (incl. outcome_totals), `import-regular-season-matchups.ts`, settings seed — all
  validated, `--dry-run`, idempotent, `sync_runs`-logged, committed · **6B — Yahoo season
  backfill** (blocked by 1B, 4B): scoreboard weeks 1..22 → `regular_season_matchups`, local
  script canonical (idempotent, logged, dry-runnable; chunked admin variant optional) ·
  **7 ∥** Race to the Bottom page (blocked by 4A — renders from DB regardless of source) ·
  **11 ∥** Admin page incl. CSRF/bcrypt/cookie auth + provisional confirm/under-review
  resolution controls (blocked by 4A)
- **8** Seed lock + bracket creation, injected-clock testable, idempotent (blocked by 4A, 5)
  · **9** Live compute + provisional advancement + settle/flag flow; integration test drives
  a full fake 3-week bracket incl. one tiebreak, one stat-correction flip, one override
  (blocked by 5, 8, and a data source: {3, 4B, 6B} on the Yahoo path or {6A} in manual mode)
  · **10 ∥** Bracket UI + matchup detail (pending/live/provisional/final/under-review/
  overridden states), buildable against fixtures parallel to 9 (blocked by 5, 8)
- **12** Champion state, status-aware (blocked by 9, 10) · **14** Security verification
  pass — probe the checklist, don't build it here (blocked by 4B, 11) · **15** Playwright
  smoke in CI: three phases, admin gate (blocked by 7, 10) · **13 ∥ continuous**
  Copy/tone/favicon/empty states
- **Yahoo-free frontier** (buildable even if 0A stalls): 0B → 1A → {4A, 5, 6A} → {7, 8, 11}
  → 10. Only 1B, 3, 4B, 6B, and 14 sit behind Yahoo access.
- **(Conditional) 16 — Manual-mode admin form** (only if 0A gate fails by Aug 17): thin
  admin UI wrapper over the already-built import path (`source='manual'`). The import
  scripts themselves ship in Issue 6A regardless.

**Process:** test-first — every outcome-deciding function (comparator, tiebreakers, re-seed,
provisional/settle, phase, parsers, normalizer) is pure with fixture-driven vitest; sync
gets one integration test; UI gets thin Playwright smoke; nothing tests against live Yahoo.
**Review of each issue happens in a fresh, cleared Claude session** (or /code-review),
never the thread that wrote the code. See [docs/review-log.md](docs/review-log.md) for why
decisions look the way they do — don't "simplify" hard-won fixes back into bugs.

## Verification

1. **Tracer bullet:** production URL renders real league standings through the full stack.
2. **Spike:** 2025 playoff-week stats for last year's 9–16 teams non-zero w/ ratio cats,
   **and** daily-stat components sufficient to reconstruct AVG/ERA/WHIP — primary path and
   fallback both proven ~4 weeks early.
3. **Bracket engine:** vitest green across tie/tiebreak/re-seed/provisional permutations.
4. **Dress rehearsal:** integration test simulates the full 3-week bracket from seed lock to
   champion, including a tiebreak, a stat-correction winner flip (flag, no auto-rewire), and
   an override.
5. **Live-fire:** Sept 6–7, watch the real seed lock + first sync in `sync_runs`; admin
   banner turns red on stale syncs.

## Open questions (tracked, not blocking)

1. Yahoo developer-portal access flow (the 0A gate; Aug 17 decision date; fallback designed
   and Yahoo-independent).
2. Batch `team_keys` week-stats call shape (spike confirms; fallback = 8 single calls).
3. League's exact Yahoo week numbers for Sept 7–27 (assumed 23–25; asserted against
   `playoff_start_week` at sync, loud warning on mismatch).
4. Refresh-token rotation ambiguity (design assumes rotation — safe either way).
5. Whether this league sets a weekly innings-pitched minimum, and Yahoo's exact forfeiture
   semantics when a team misses it (settings snapshot answers the first; spike Issue 3
   verifies the second against a real 2025 week).
