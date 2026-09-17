# Review Log — PRD Revision History

Six review rounds between Claude (author; fresh-context Plan-agent research) and Codex
(external reviewer; clean context each round), July 30–31, 2026. Every round found something
real; the loop closed by mutual agreement when findings dropped below design level.

This log exists so implementing agents know **why decisions look the way they do** and don't
"simplify" hard-won fixes back into bugs. If a design element below seems overwrought
(internal IDs everywhere, the 4A/4B split, the freeze semantics), it earned its shape here.

## Round 1 (rev 1→2)

Codex found: the **settle-buffer conflict** — rev 1 finalized results after a 24 h
stat-correction window while the next round starts Monday morning; the two facts couldn't
coexist (the one true design bug of the loop; fixed with provisional advancement). Also:
treat Yahoo API access as a gated critical path with a decision date (Aug 17) and a real
fallback; prove the fallback in the spike ("an unproven fallback isn't a fallback"); make
Vercel Hobby constraints explicit (dynamic pages, maxDuration, chunked/local backfill); add
provisional/settle schema fields; move security (CSRF, hashing, noindex) into the build
rather than a deferred hardening pass.

Claude's counter-contributions: canonical-source ruling (Yahoo's published numbers canonical
wherever Yahoo adjudicated; our comparator only for bowl matchups — reversing rev 1), the
`stat_lines` source-agnostic seam, the no-auto-rewire freeze rule, and backfill as a local
script instead of contorted serverless.

## Round 2 (rev 2→3)

Fallback made activatable-in-an-hour (CSV shape + import scripts built early, not on
gate-failure day); Yahoo payload provenance stored for disputes; exact freeze semantics
specified (frozen matchup, public banner, downstream badge, branch-only advancement pause,
admin resolution); backfill rigor (idempotent, logged, dry-runnable, committed). Password
hashing kept — Codex's accidental-leak framing (logs, dashboard copy-paste) beat Claude's
threat-model shrug.

## Round 3 (rev 3→4)

Best catch: the fallback was **Yahoo-shaped** — CSVs validated against an API-derived
settings snapshot and keyed by Yahoo team keys, both of which only exist if the API works
(circular). Fixed with internal team ids, nullable Yahoo keys, seedable settings, and the
1A/1B tracer split. Also: the **innings-pitched minimum** rule (standard Yahoo baseball
setting that can flip ERA/WHIP outcomes — a genuine domain miss); seed-lock corrections
given the same provisional policy as round corrections; OAuth `state` must ride a
SameSite=Lax cookie (the Yahoo redirect is cross-site — Strict silently breaks the
callback); `after()` inherits the invoking route's duration budget; Yahoo attribution;
stat_id CSV keys; explicit timezone + region pinning.

## Round 4 (rev 4→5)

Same coupling bug, second instance: Issue 6 (the fallback importer!) was transitively
blocked on Yahoo via Issue 4 → split 6A/6B. Manual mode couldn't adjudicate ties — added
regular-season-matchup and outcome_totals imports. Internal-ID cleanup finished through
matchups and stat slugs. CSV gained support-stat columns. Champion phase made status-aware
(COALESCE alone would confetti a provisional final).

## Round 5 (rev 5→6)

Same coupling bug, **third instance**, now on the app path (Race, Admin, Seed Lock all
transited Issue 4 → 1B → Yahoo) → 4A/4B split, yielding the explicit Yahoo-free frontier:
0B → 1A → {4A, 5, 6A} → {7, 8, 11} → 10. The sneakiest catch of the loop: WHIP support
stats conflated batting hits/walks with hits-allowed/walks-allowed — a bug that
type-checks, survives same-mental-model fixtures, and fires only in manual mode in a
WHIP-decided matchup. Fixed with distinct slugs that make the conflation inexpressible.
Plus explicit storage for outcome_totals and seed-lock review state (spec-schema drift).
Both reviewers agreed to close the loop.

## Round 6 (final)

Implementation-ready verdict. One alignment fix: the spike paragraph rewritten to prove the
importer's exact six support slugs rather than aggregate components.

## Lessons (transferable beyond this project)

1. **Fresh-context review works.** The two best catches (settle-buffer, WHIP conflation)
   were structurally invisible from inside the context that produced them.
2. **Sweep for the pattern, not the instance.** The identical Yahoo-coupling bug was found
   three times (data layer, issue-graph edge, app path). After a reviewer finds one instance
   of a coupling bug, the author should walk every path back to the dependency and audit for
   the class — Claude fixed instances and never self-initiated the sweep.
3. **Prose amendments must trigger a schema/graph re-walk.** Three findings were pure
   spec-schema drift: behavior added in later revs (outcome_totals, seed-lock states, spike
   wording) with no storage or no updated proof obligation.
4. **Know when to stop.** Finding profile across rounds: design bug → process gaps →
   coupling/domain → coupling again + bookkeeping → wording. When findings drop below design
   level and remaining unknowns are empirical, hand off to a spike, not another round.
5. **Verification instruments must speak the implementation's vocabulary.** The spike proves
   the six exact slugs the importer consumes, not a paraphrase of them.
6. **A designed fallback is judged by its ancestry.** "Fallback exists" is not the bar;
   "fallback's entire dependency ancestry avoids the thing it's a fallback for" is.

## 2026-09-07 — Live tally + "Updated" freshness (Codex `gpt-6-astra`, fresh context, read-only sandbox)

Diff reviewed before deploy: read-time live tally (`src/lib/bracket/liveTally.ts`,
`public/matchups.ts`, `sync/trigger.ts`, bracket/detail UI), the data-writing-runs-only
`lastUpdatedAt` filter, and the post-import report in `scripts/import-stats.ts`.

- **No P1.** Reviewer independently checked tally orientation, leader selection,
  league-time round boundaries, the new Drizzle queries, and isolation from the engine's
  final-mode result (parity above the IP minimum); the plain-Node import chain loads.
- **P2 (fixed):** the post-import report ran between the upsert and the success
  `sync_runs` row, so a report-side throw would log the committed import as an error and
  leave "Updated" stale. Report now runs after the success log inside its own try/catch.
- **Noted, not fixed:** five pre-existing `tsc` errors in `comparator.test.ts`
  (`display_name` on `WeekStatCategory`). Reviewer claimed they block `next build`; they
  don't (Turbopack and webpack builds both passed this session) — test-only noise.

## 2026-09-17 — Adversarial security review (Codex `gpt-5.5`, fresh context, read-only sandbox)

Brief: `docs/reviews/security-review-brief-2026-09-17.md`; raw output:
`docs/reviews/security-review-2026-09-17-codex-raw.md`. Scope: OAuth, sync, admin auth,
`parseStatsRow`, scripts, schema, deps. Codex reported **no P1s**, four P2s, one P3. Each was
re-verified independently before anything was acted on (identify → false-positive check →
only ≥8/10 survives). One thing the brief got wrong and was corrected in the saved file: it
called the app driver `neon-http`; it is `neon-serverless` over WebSocket, so the
`db.transaction()` calls in `matchupCompute.ts`/`seedLock.ts` are real.

- **Acted on — the one real finding, and Codex couldn't see it (no network):** `npm audit`
  showed `next@16.2.12` under GHSA-2xp9-vwfh-vxw4, a *critical* unauthenticated RCE in the
  Image Optimization API via AVIF (libheif through sharp), affecting `>=16.0.0 <16.3.3`.
  `/_next/image` is served by every Next app regardless of whether the code uses
  `next/image` (prod answered it with a 400, i.e. it's on). Upgraded `next` +
  `eslint-config-next` to 16.3.5; that also moves the bundled sharp/postcss out of their
  advisory ranges. Remaining audit items are dev-only or inapplicable (`esbuild` under
  `drizzle-kit`'s esm-loader, `@vitest/mocker`, `js-yaml` under eslint, `nanoid`'s
  zero-size custom generator); `npm audit fix` crashed inside npm and changed nothing.
- **P2 "public visits can run sync / consume backoff" — reframed, decision pending.** The
  attacker part is a false positive: visitors cannot cause Yahoo failures, and backoff on real
  failures is the desired behaviour whatever the trigger. But checking it exposed a real
  inefficiency: `isStale` reads `sync_state.last_success`, which the Aug 1 P2-7 fix changed to
  advance only when a sync *wrote* data. So once the numbers haven't moved for 30 min
  (overnight, or once weeks are final) every page view schedules a full Yahoo pull — one call
  per started bowl week — until something changes. Any anonymous visitor controls that
  amplification. Proposed fix: `last_success` goes back to meaning "last successful sync"
  (freshness clock), and the public "Updated" stamp uses only the data-writing `sync_runs`
  query `trigger.ts` already runs (`lastUpdatedAt` drops the `latestOf(lastSuccess, …)`).
  Not shipped mid-round without Scott's call — it changes sync cadence on a live bracket.
- **P2 login throttle bypass via `X-Forwarded-For` — false positive on Vercel.** Vercel's
  request-headers doc: it overwrites `X-Forwarded-For` and does "not forward external IPs …
  to prevent IP spoofing"; a custom XFF needs an Enterprise trusted proxy. (The throttle being
  in-memory per instance is a separate, already-known limit; bcrypt + a strong password is
  the real defence.)
- **P2 standings import can half-apply — true but moot.** `scripts/import-standings.ts` runs
  16 UPDATEs over `neon-http` with no transaction. Ranks only feed the seed lock, which
  settled at the bracket lock date; a mid-loop crash now changes nothing the bracket reads,
  and re-running the import repairs it. Not fixing (states the system can't produce).
- **P2 `_oneoff-cleanup-placeholder-teams.ts` is unguarded — true.** It deletes every
  matchup, resets the seed lock, and clears every `final_seed`, with no dry-run and no
  confirmation. Precondition is repo + `.env.local`, i.e. the operator; the risk is a
  mis-tab-completed command, not an attacker. It ran once in August and has no further use.
  Recommendation: `git rm` it (history keeps it). Scott's file, Scott's call.
- **P3 `^\d+$` admits a 309-digit at-bats → `Infinity` → `"NaN"` AVG — true, unreachable.**
  Source is Yahoo or the admin's own CSV. Noted only.
- **Checked-sound list** from Codex matched my own reading: admin mutations behind
  `requireAdminMutation` + Origin check, proxy matcher covers `/admin`, `/api/admin`,
  `/api/sync`; cron GET needs `CRON_SECRET`; OAuth state via `timingSafeEqual`; status
  queries never select token columns; today's token-message fix present.
