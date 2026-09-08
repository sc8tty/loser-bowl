# Status (as of 2026-09-07, end of session)

## Manual mode is now live — playoffs started, Yahoo access never came through
Yahoo Fantasy API access has not been approved as of this session (see External section) —
well past the PRD's own Aug 17 manual-mode decision date, and playoffs (Week 24) started
2026-09-07. Rather than wait any longer, this session activated manual mode for real:
real teams, real scoring categories, real week numbers, a working seed lock, and a verified
weekly CSV-import path. The site (`loserbowl.landermedia.com`) is live, on the real database,
correctly showing Round 1 with real teams.

## What changed this session (large session — infra bugs, real data, real UI)

### Real league data replaces Issue 1A's placeholder fixture
- **`fixtures/standings.2026.json`** — the real 16-team 2026 Lander's League standings
  (transcribed from Yahoo's Standings tab), byte-verified against Yahoo's actual team-name
  strings including apostrophe style (Yahoo is inconsistent: curly `'` in "O's Before Hoes",
  straight `'` in "Trout's Honor" and "You Hang'em We Bang'em" — checked via Unicode code
  points, not eyeballing, since the two render identically in most fonts).
- **`scripts/seed-fixture.ts`** now takes an optional file-path argument
  (`npm run seed:fixture -- fixtures/standings.2026.json`), defaulting to the old Issue 1A
  placeholder for backward compatibility.
- **Ran the real seed against production** — but it only *added* the 16 real teams; the 16
  old placeholder teams (Moonshot Accountants, Cellar Strategists, etc.) were never removed,
  so the live site briefly showed a corrupted 32-team mixed bracket. Cleaned up with
  `scripts/_oneoff-cleanup-placeholder-teams.ts` (deletes the 16 known placeholder IDs, resets
  `sync_state`'s seed-lock fields, clears `finalSeed` on all teams, deletes stale matchup
  rows) — kept in the repo as a record of what was done, not meant to run again.

### Real scoring categories replace the Issue 1A placeholder set
`src/config/categories.seed.ts`'s `SEEDED_STAT_CATEGORIES` was explicitly marked
"placeholder pending real Yahoo league settings" and didn't match the real league at all.
Confirmed the real 15 categories via Yahoo's live Scoring & Settings page:
- **Batting (8):** R, 2B, 3B, HR, RBI, SB, AVG, OPS
- **Pitching (7):** W, BB, K, ERA, WHIP, K/9, NSVH (Net Saves + Holds — not raw SV)
- **Min innings pitched: 24/week** (was `null`)

**Key design decision (Scott's call):** OPS, ERA, WHIP, and K/9 are all **trusted as
transcribed directly from Yahoo**, not derived from raw components, because Yahoo's team/
player pages never expose the raw components needed to compute them ourselves — no earned
runs allowed, no hits allowed, no batter BB/HBP/SF anywhere in the UI, only the
already-computed ratios. AVG is still recomputed from at-bats/hits (which Yahoo does show
directly, as "H/AB"). This removed `earned_runs_allowed`, `hits_allowed`, and `walks_allowed`
from the schema entirely (nothing derives from them anymore) — `innings_pitched` stays, but
only for the min-IP policy check, not for ratio derivation.
`scripts/lib/stat-rows.ts` and `scripts/import-stats.ts` updated accordingly: `avg` is the
only recomputed/ignored-if-provided ratio; `ops`/`era`/`whip`/`k9` are validated as decimals
(or Yahoo's `-` placeholder) and passed through as-is.

### Week numbers were off by one
`LEAGUE_CONFIG.rounds` in `src/config/league.ts` had the right dates (Sep 7–13, Sep 14–20,
Sep 21–27) but the wrong week numbers (23/24/25) — Yahoo's actual week numbering for those
same dates is **24/25/26**. Scott confirmed directly from the live league page ("Week 24
Matchups — In progress" on Sep 7). Fixed in `league.ts`; also had to fix hardcoded week
literals in `matchupProcessor.test.ts`'s dress-rehearsal fixture (now derived from
`LEAGUE_CONFIG.rounds[N].week` instead of hardcoded `23`/`24`/`25`) and rebalance
`e2eFixtures.ts`'s category-win-count fixtures for the 15-category total (was tuned for 10).

### Weekly manual CSV import — tested with real Week 24 data, working
Pulled real Week 24 in-progress stats for all 8 Loser Bowl teams from Yahoo (Standings tab →
each team's Stats page, "Today" filter — since Sep 7 is day 1 of Week 24, "Today" totals equal
the week's cumulative totals so far; this won't hold true for later days in a week, needs
re-deriving each day or waiting for `npm run import:stats` to run against a full day's data).
Built and ran a real CSV against `scripts/import-stats.ts` — validated with `--dry-run` first,
then imported for real. 8 stat lines landed in production for Week 24.

### Found and fixed: seed lock had never once succeeded in production
`src/db/index.ts` used `neon()` + `drizzle-orm/neon-http` (the HTTP/fetch Neon driver), which
**never supports `db.transaction()`** by design (stateless per request). Both
`src/lib/sync/seedLock.ts` (Issue 8) and `src/lib/sync/matchupCompute.ts` (Issue 9 — the
actual weekly bracket-advancement engine) call `db.transaction()`. Every visit-triggered sync
attempt had been failing identically with `"No transactions support in neon-http driver"` —
this predates this session entirely; seed lock had never worked against the real database,
which is the real reason the bracket never locked despite the Sep 6 lock date passing.
**Fixed** by switching to `drizzle-orm/neon-serverless` + `Pool` (WebSocket-based, supports
real transactions; added `ws` + `@types/ws` as dependencies since Node's runtime needs a
WebSocket implementation supplied). Verified against the real production database: seed lock
now succeeds, Round 1 shows the real bottom-8 teams correctly paired (9 SLUMP BUSTERS vs
16 Baseball Furries, etc.). **Confirmed working-as-designed, not a bug:** the weekly matchup
compute engine only computes a tally once `hasMatchupWeekClosed` is true (i.e., after a round
actually ends) — "Tally: Not computed" mid-week is correct, not broken. Live in-app category
tracking during the week (Tier 1 from the Issue 4B two-tier design) is a separate, unbuilt
feature.

### Found and fixed: production was never connected to GitHub — deploys were 19 days stale
`vercel project inspect loser-bowl` showed no Git Repository section at all. The project had
been deployed exclusively via manual `vercel --prod`-style CLI runs since it was created
38 days ago — pushing to `main` never triggered anything. The most recent production
deployment was **19 days old** when this was discovered, meaning today's first commit
(`6b89efe`) sat unpublished even after pushing. `vercel git connect` failed with a generic
error until Scott connected the repo himself via the Vercel dashboard (Settings → Git —
needs the GitHub App authorized for this specific repo, which only he can grant). Verified
end-to-end afterward with a real empty-commit push: Vercel auto-deployed and went `Ready` in
28 seconds. **This is now fixed — pushes to `main` deploy automatically.**

### Home page UI changes (Scott's direct requests)
- Header eyebrow/heading swapped: the phase status ("Race to the Bottom" /
  "Loser Bowl Bracket" / "Champion Crowned") is now the small eyebrow label; "Lander's League
  Loser Bowl" (the persistent site name) is the big `h1`.
- Bracket/pairings section moved above the standings section (previously standings-first).
- "Current Standings" renamed to "Regular Season Standings"; "Projected bracket" eyebrow
  renamed to just "Bracket".
- Removed the kebab-case team-id text that was rendering under team names on the standings
  table (`standings-table.tsx`).
- Removed the "Lock" status box from the header entirely; the round date range now lives
  inline in the "Bowl weeks" line instead, e.g. `Bowl weeks 24, 25, 26 (Sep 7–Sep 27)`.
- **"Updated" freshness text was reading Yahoo-only state and would show "—" forever during
  manual mode.** `src/lib/sync/trigger.ts`'s `lastUpdatedAt` (new field, `LeagueData` type)
  now sources from the most recent successful `sync_runs` row across **any** trigger
  (Yahoo engine and manual `import-*.ts` scripts both log there), not just
  `sync_state.lastSuccess` (Yahoo-only). Confirmed live: "Updated just now" after the manual
  import + seed lock, instead of a stale "37 d ago" reading from an old dev-era Yahoo test.

## Manual mode — the operational loop going forward
Until Yahoo access lands (if it ever does), the weekly cadence is:
1. Visit the live Yahoo league site, pull each of the 8 Loser Bowl teams' current stats
   (Standings tab → click into each team → "Stats" tab, correct date filter for the day).
2. Build a CSV matching `scripts/import-stats.ts`'s expected columns (see
   `scripts/lib/stat-rows.ts` for the exact schema — `r,2b,3b,hr,rbi,sb,ops,w,bb,k,era,whip,
   k9,nsvh,at_bats,batting_hits,innings_pitched`, plus `team_id,week`). Real team IDs are the
   slugs in `fixtures/standings.2026.json` (e.g. `slump-busters`, `eat-the-rich`).
3. **Transcription rule for a team's zero-innings-pitched pitching line:** Yahoo shows `-`
   for every pitching column (IP, W, BB, K, ERA, WHIP, K/9, NSVH) when a team has recorded no
   innings yet. For the true counting stats (W, BB, K, NSVH) this means `0`, not `-` — the
   games just haven't happened, the count really is zero. Only the ratio columns (ERA, WHIP,
   K/9) should be transcribed as literal `-` (Yahoo's own "undefined at 0 IP" placeholder).
4. `npm run import:stats -- --dry-run path/to.csv` to validate, then without `--dry-run` to
   commit it.
5. The bracket's own computed tally only updates once a round actually closes (see the
   matchup-compute note above) — there's no live in-app tracking yet, so don't expect
   "Tally" to move mid-week even with fresh imports.
6. `import-standings.ts` and `import-regular-season-matchups.ts` exist for the tiebreaker
   data (season category win totals, head-to-head results) but weren't exercised this
   session — the Schedule tab (per-team, 23-week list of opponent/result/score) is the source
   for tiebreaker #1 data when that's needed.

## External — Yahoo API access (unchanged this session; still pending)
- Yahoo Fantasy API access application submitted 2026-07-31. Still **not approved** as of the
  last check (2026-08-26) — 2 follow-up emails sent (2026-08-17, 2026-08-26, the second
  cc'ing sports-dev-guide@notify.yahoo.com and noting the signed agreement up front). No
  Yahoo reply logged yet to either the access-application follow-ups or the 2026-08-19
  Section 2.c.vii data-storage clarification email. Watch sc8tty@gmail.com.
- Yahoo's automated email claiming "Fantasy Sports is now available" turned out to be
  incorrect for this account — confirmed by testing both the existing app and a freshly
  created one; neither shows a Fantasy Sports option, only "OpenID Connect Permissions" and
  "TW Auction" (unrelated, likely legacy Yahoo Auctions). Replied on that thread with this
  evidence 2026-09-07; no response yet as of session end.
- The signed API Access and Use Agreement (Scott signed 2026-08-19) — Yahoo countersignature
  and the Section 2.c.vii clarification are both still outstanding.
- Design decision from 2026-08-19 (two-tier Yahoo data access: live ephemeral fetch vs.
  official nightly Postgres snapshot) is still the plan **if/when** Yahoo access lands —
  nothing about manual mode changes that design, it's just deferred.

## Known-resolved (kept for history)
- Domain 404 / Deployment Protection issues from earlier sessions: resolved 2026-08-19 (see
  memory `project_vercel_alias_bug.md` — Framework Preset was "Other" instead of "Next.js").
- `drizzle-kit migrate` hangs in this environment (confirmed, worked around via direct script
  — see git history before this rewrite for the full note, still applies to any future
  migration).
- Bcrypt hashes in `.env.local` get mangled by Next.js's `$`-expansion — must backslash-escape
  `$` in `ADMIN_PASSWORD_HASH` locally; Vercel's own env storage needs the raw unescaped hash.

## Next session
- Continue the weekly manual CSV cadence (see "Manual mode" above) through all three playoff
  rounds (Weeks 24, 25, 26 — through Sep 27).
- Watch for a Yahoo reply on either thread; if access ever lands, Issue 4B (real sync) and
  the two-tier data design are still the plan, but nothing is currently blocked on it.
- `import-standings.ts` / `import-regular-season-matchups.ts` haven't been exercised with
  real data yet — will be needed the first time a real tiebreaker actually comes up.
- The heavyweight Fable review of Issue 9 (matchup compute — decides real bracket outcomes
  for the $50 pot) is still pending from prior sessions; now doubly worth doing since it just
  started actually executing against production for the first time.
