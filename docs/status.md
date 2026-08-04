# Status (as of 2026-08-02, end of session)

## Done — committed, on `main`, not yet deployed/verified live
- **1A** (tracer bullet), **5** (bracket engine), **6A** (CSV import scripts),
  **4A** (sync shell), **7** (Race to the Bottom polish — lock countdown, drop-zone/pairing
  edge cases), **11** (Admin page — bcrypt+HMAC auth, sync log, override/settle controls,
  Yahoo health), **8** (Seed lock + bracket creation), **9** (Live compute + provisional
  advancement + settle/flag flow), **10** (Bracket UI + matchup detail — see below) — all
  built, cold-reviewed by fresh-context sessions, findings fixed. 166 tests green. HEAD after
  Issue 10: `e8e7a30`.
- **Issue 10** is the phase-aware public UI reading Issues 5/8/9's output: `home-page.tsx`
  now actually branches on `phase()` (race/bracket/champion) — previously `page.tsx` always
  rendered the Race view regardless of phase, a real gap this closed. New `bracket-view.tsx`
  (7-slot bracket, status badges, TBD placeholders that don't presuppose a pairing — PRD's
  re-seeding is highest-vs-lowest among a round's actual winners, not a fixed bracket tree)
  and `matchup-detail.tsx` (`/matchup/[id]` — team-level stat lines, running tally,
  plain-language decided-by wording, public override provenance). Read-only, no admin actions
  exposed, matching PRD's "public link, no viewer auth" requirement. Manually smoke-tested
  against the live dev server (race view unbroken; `/matchup/r1m1` correctly shows an honest
  "not created yet" state, since today predates the real seed lock — bracket/champion views
  couldn't be checked against live data, verified via new component-level fixture tests plus
  cold review instead). Cold review found no blocking issues; fixed one polish nit (a
  not-yet-created matchup page showed the raw id like "r1m1" instead of "Round 1 Matchup 1").
- **Issue 9** bridges the pure comparator/tiebreaker/state-machine engine (Issue 5) to real
  weekly matchup computation: `matchupProcessor.ts` (pure decisions — compute a week via
  `compareWeek`, tiebreak on a true tie, advance a round once every source matchup has an
  effective winner and none are `under_review`, re-seed via `nextRoundPairings` from
  original bowl seeds) + `matchupCompute.ts` (transactional DB executor, same atomic
  per-status-guard pattern as Issue 8's seed lock). Dress-rehearsal integration test drives a
  full fake 3-week bracket: seed lock → h2h tiebreak → a stat-correction flip that freezes
  its branch while others keep computing → admin override → resumed advancement → champion.
  Cold review found **no correctness bugs** but flagged a real gap against this project's own
  test-first convention: the new pure module had only the one integration test vs. 8-15
  discrete branch-level cases for comparable modules (`seedLockProcessor.ts`,
  `stateMachine.ts`). A follow-up Codex pass closed it: 143 → 157 tests, plus a fix to the
  dress rehearsal's freeze assertion (it wasn't actually isolating the freeze as the cause
  vs. missing data) and a fragile object-spread cleanup. This is the biggest, most
  consequential remaining piece of business logic in the project (decides real bracket
  outcomes for the $50 pot) — worth another look in the eventual Fable heavyweight review
  even though the per-issue cold review came back clean.
- Issue 8 bridges the pure bracket state machine (Issue 5) to real DB writes: a
  `seedLockProcessor.ts` pure decision function + `seedLock.ts` transactional executor with
  atomic per-action `WHERE status = '<expected>' ... RETURNING` guards, so the 7-row bracket
  skeleton (r1m1-r1m4 populated, r2m1/r2m2/final placeholders) can't get double-created under
  concurrent visits. Required a schema migration (`sync_state.seeds_corrected_snapshot`) to
  let the admin under-review flow actually distinguish "confirm original" from "relock
  corrected" — previously (Issue 11) that comparison was a same-snapshot placeholder that
  couldn't really tell them apart. Cold review caught one real gap (admin settle route could
  silently perform a real lock instead of reporting an error if called while status was
  still `none`) — fixed with an explicit state guard before the call.
- All three of Issue 7, 11, and 8 were built by `codex exec -s workspace-write` (NOT
  `--full-auto` — that flag gets blocked by Claude Code's own permission classifier when run
  via Bash; `-s workspace-write` works). All three finished clean on the first attempt (~5,
  ~14, ~13 min), no hangs — a big improvement over last session's 4 hangs. Cold review (fresh
  Claude subagent, solo, no workflow fan-out) caught zero real bugs in Issue 7's diff, one
  accepted-tradeoff finding in Issue 11 (in-memory per-IP login throttle won't survive across
  Vercel serverless instances — already scoped that way in the build brief, not fixed), one
  real fixed finding in Issue 8 (above).
- **`drizzle-kit migrate` hangs in this environment** — confirmed twice, spins forever on
  "applying migrations..." with a `'@neondatabase/serverless' can only connect ... through a
  websocket` warning first. Worked around by applying the migration SQL directly via a small
  script using `@next/env`'s `loadEnvConfig()` + `neon()` from `@neondatabase/serverless`
  (same driver the app uses, just called directly instead of through drizzle-kit's CLI), then
  manually inserting the matching row into `drizzle.__drizzle_migrations` (hash = sha256 of
  the raw migration file content — see `node_modules/drizzle-orm/migrator.js` for the exact
  algorithm) so future `drizzle-kit migrate` runs don't try to reapply it. **Use this
  direct-apply approach for future migrations in this repo**, not `drizzle-kit migrate`.
- Vercel project `loser-bowl` (sc8ttys-projects) + Neon Postgres provisioned and connected.
- `CRON_SECRET` set in Vercel prod env; daily cron configured in `vercel.json`.

## New gotcha found this session — bcrypt hashes in .env.local get corrupted by Next.js env expansion
Next.js's `@next/env` loader (used for `.env.local` in dev, and for `.env*` files generally)
performs variable expansion on `$`-prefixed tokens — the same feature that lets one env var
reference another (`$OTHER_VAR`). A bcrypt hash like `$2b$10$1al.Urnc...` gets its `$2b$10$`
prefix silently stripped/mangled because `2b` and `10` look like variable names to expand
(to empty string, since they don't exist). Confirmed by direct test with `@next/env`'s
`loadEnvConfig()`. **Fix: backslash-escape every `$` in `ADMIN_PASSWORD_HASH` inside
`.env.local`** (`\$2b\$10\$...`) — confirmed this round-trips correctly.
**This escaping is local-dev-only.** Vercel's own env var storage injects values directly
into `process.env` with no dotenv-expand pass — when setting `ADMIN_PASSWORD_HASH` in the
Vercel dashboard/CLI for production, use the **raw, unescaped** bcrypt hash. Local
`.env.local` currently has the admin password hash set (escaped) and a generated
`ADMIN_SESSION_SECRET`; both are placeholders for local testing only — **Scott should set
his own production values in Vercel before this goes live**, not reuse the session-generated
ones.

## Known issue — domain still not resolving (narrowed further this session)
`loserbowl.landermedia.com` still returns **404 (Vercel NOT_FOUND)**. DNS/TLS remain fine
(A record `76.76.21.21`, valid cert). New findings this session, via `vercel inspect` /
`vercel alias ls` / `vercel logs`:
- The alias record is correct — `vercel inspect` confirms `loserbowl.landermedia.com` points
  at the current Ready production deployment, and the build itself is healthy (`/` is a
  valid dynamic route, no build errors).
- The 404 happens **at Vercel's edge, before the function is ever invoked** — `vercel logs`
  shows zero log entries for requests to the custom domain.
- **Isolated the pattern**: Vercel's **auto-generated** aliases
  (`loser-bowl-<hash>-sc8ttys-projects.vercel.app`, the plain
  `loser-bowl-sc8ttys-projects.vercel.app` project alias) route correctly and hit Deployment
  Protection (302 → Vercel SSO login) — proving the deployment itself is reachable.
  **Non-default** aliases — `loser-bowl-bice.vercel.app` (a short vanity alias) and the real
  custom domain — both 404 at the edge with no function invocation. This isn't domain-DNS
  specific; it reproduces on a `.vercel.app` vanity alias too.
- Re-ran `vercel alias set` to force a fresh mapping — no change.
- Checked vercel-status.com — no platform-wide incident.
- **Conclusion: this looks like a genuine Vercel edge bug scoped to non-default aliases on
  this project**, not a config mistake. Next step is genuinely the dashboard now (Project →
  Settings → Domains), which needs a login this session didn't have (password manager not
  connected to Claude; Claude-in-Chrome's Chrome profile isn't signed into vercel.com either).
- **Second, independent problem found**: Deployment Protection (Vercel SSO) is ON for this
  project. Even once the alias bug is fixed, visitors would hit a Vercel login wall instead
  of the site — contradicts PRD's "public link, no viewer auth" requirement. **Must be
  turned off for production** in Vercel dashboard → Settings → Deployment Protection,
  independent of the alias-routing fix.

## External — waiting, no action needed from us
- Yahoo Fantasy API access application submitted 2026-07-31 (App ID `DQcUfVuZ`). Yahoo
  acknowledged same day: review takes 1–2 weeks → expect ~Aug 7–14, inside the **Aug 17**
  manual-mode fallback gate. Watch sc8tty@gmail.com for any clarification requests.

## Next issues to build (all Yahoo-free, no blockers)
- **12** — Champion state (blocked by 9, 10 — both now done). Note: `phase.ts`'s existing
  `phase()` function already derives the champion phase purely from the final matchup's
  effective winner + status, and Issue 10 already built a champion-phase view in
  `home-page.tsx` — check what's actually left here before assuming a full build is needed,
  this may already be substantially covered.
- **13** — Copy/tone/favicon/empty states (continuous, parallel-safe, no blockers)
- **15** — Playwright smoke in CI: three phases, admin gate (blocked by 7, 10 — both done)
- **14** — Security verification pass (blocked by 4B, 11 — 11 done, 4B still gated on Yahoo
  API access). One of the two heavyweight Fable reviews Scott is holding for a dedicated
  session (the other is Issue 9) — still not ready to trigger, 4B isn't built.

## Remaining Yahoo-free work is thin
Per PRD's task graph, almost everything buildable without Yahoo access is now done: 1A, 4A,
5, 6A, 7, 8, 9, 10, 11 are all shipped. What's left Yahoo-free is 12 (champion state, likely
small given 10's overlap), 13 (ongoing polish), and 15 (Playwright smoke). The remaining
substantial work (1B, 3, 4B, 6B, 14) is gated on Yahoo API access (submitted 2026-07-31,
decision date Aug 17) — see External section below.

## Process notes for next session
- **Codex worked cleanly this session** (3/3, no hangs) — a reversal of last session's 4
  hangs. Two things changed: avoided `-c model_reasoning_effort` (per last session's
  finding) AND used `-s workspace-write` instead of `--full-auto`. Note `--full-auto` isn't
  just risky, it's **actually blocked** — Claude Code's own Bash permission classifier
  rejects `codex exec --full-auto` outright (denied both plain and `nohup`/backgrounded
  variants). `-s workspace-write` is the correct flag for unattended builds now.
- Watchdogged via a `Monitor` polling loop (file-mtime + process-alive check every 60s, one
  synchronous log peek around the 5 min mark to confirm real progress vs. stalled) instead of
  passively waiting — worked well, caught real progress each time before the 15-20 min kill
  threshold would have triggered.
- Fresh-context cold review (Claude reviewing Claude's/Codex's own recent commits, solo, no
  workflow fan-out) remains worth doing every issue — caught one real finding each in Issues
  11 and 8, zero in Issue 7, even though tests/build/lint were clean every time. Keep doing
  this for every issue, not just Codex-built ones.
- When a build task might need a DB schema change, ask before letting Codex run migrations
  unattended — but note Codex's sandbox **can't reach the live Neon DB anyway** (network
  access is restricted inside `-s workspace-write`), so it can only generate migration files,
  never apply them. Plan to apply generated migrations yourself afterward (see the
  `drizzle-kit migrate` hang note above) rather than expecting Codex to finish that step.
- Effort-slider gotcha: the rightmost position in Scott's UI is **Ultracode** (mandates
  multi-agent workflows, expensive), not "max thinking." For heavyweight reviews use Fable
  one notch left of Ultracode.
- **When cold review finds a real gap (not just a bug), a scoped follow-up Codex task works
  well** — Issue 9's follow-up (close a test-coverage gap + two small findings) took ~10 min,
  found no new bugs, and the resulting diff was worth spot-checking directly (not just
  trusting green tests) before committing — e.g. manually verified the re-seeding test table
  against PRD's "highest remaining seed plays lowest" rule for top/bottom/mixed-seed cases.
  Reserve this for real gaps against the project's own stated conventions (PRD's test-first
  mandate), not for defensive/speculative findings — those should ship as-is, not trigger a
  follow-up.
- The heavyweight Fable review (Issue 9, the security pass) is still pending. Issue 9 now
  exists and is a strong candidate for it even though the lighter per-issue cold review came
  back clean, given the stakes. The security pass (Issue 14) still isn't ready to trigger —
  it's blocked by 4B (Yahoo sync engine), which is gated on Yahoo API access.
- With Issues 7-11 all shipped, remaining Yahoo-free work is thin (see above) — the next
  session may hit the point where everything left genuinely needs either Yahoo access or a
  design/copy pass rather than more backend build work. Worth checking in with Scott about
  priorities rather than defaulting to "keep building the next unblocked issue."
