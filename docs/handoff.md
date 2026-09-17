# Handoff prompt — paste this to start a fresh session

> Written 2026-09-17. Overwrite this file at each handoff; `docs/status.md` is the durable record.

---

I'm continuing work on **loser-bowl** (`~/Development/loser-bowl`), a Next.js 16 + Drizzle/Neon app on Vercel at https://loserbowl.landermedia.com that runs a fantasy-baseball consolation bracket for Lander's League. A $50 pot rides on the results, so **data integrity is a correctness requirement**, not a nice-to-have. Public repo `sc8tty/loser-bowl`.

**Start by reading the top block of `docs/status.md`** ("Where things stand" / "Known open items" / "Yahoo API facts"). It is the current handoff and is authoritative over anything I say here or anything in memory. Then `git pull` and `gh run list --branch main --limit 3` to confirm main is green before touching anything.

## Current state (verified 2026-09-17)
- **The site syncs itself from the Yahoo Fantasy API.** A page visit schedules a sync via `after()` when data is >30 min old; it pulls every started bowl week (one call per week, all 16 teams), diffs, writes only changed rows, then runs the engine's housekeeping. Running unattended since 9/14. **Do not propose manual stat pulls** — the manual CSV path and the per-day ledger + `scripts/roll-up-week.ts` exist only as fallback.
- **Round 1 is final. Round 2 (Week 25, Sep 14–20)** is in progress: Eat The Rich vs Baseball Furries, Me So Hoerner vs Sheatriptease Bangeliers. The **Final is Week 26 (Sep 21–27)**. When a week closes, the engine records results as `provisional`, then flips to `final` on the first sync tick after a 24-hour correction window. Nothing is needed from us for that.
- CI runs vitest + typecheck + lint + build + Playwright; 231 tests green at `6f1ce8b`.

## Open items, in priority order
1. **Fix the one verified security finding (Low):** `DrizzleQueryError` messages embed bound query params, so a DB failure during the token upsert in `src/lib/yahoo/tokens.ts` would put the Yahoo access + refresh tokens into `sync_runs.error` (rendered on `/admin`) and Vercel logs. Wrap both writes in `storeTokens`/the refresh path and rethrow `new Error("Failed to store Yahoo tokens", { cause: e })`; strip anything after `params:` in `runSync`'s recorded message as a backstop. Add a test that the stored error never contains the token.
2. **Re-run the Codex fresh-context security review** — the previous run was killed by a session boundary before writing output. Brief: adversarial, read-only sandbox, `-m gpt-5.5`, scope = OAuth flow, sync, admin auth, `parseStatsRow`, scripts, `npm audit`. Verify any finding it produces before acting on it (the 9/15 Claude review's methodology: identify → independent false-positive check → only ≥8/10 confidence survives).
3. Add a duplicate-name guard to `scripts/backfill-yahoo-team-keys.ts` (it matches Yahoo team_key → DB team by exact name; a renamed team could collide). Not urgent; it's a one-time script.
4. Watch the Round 2 close-out Sunday night 9/20 → Monday: confirm both semis go `provisional` on the first tick after the week ends, the Final's slots populate, and the home page features the Final (it's calendar-driven — `currentRound()` in `bracket-view.tsx`).

## Rules for this project, learned the hard way this week
- **After every push, run `gh run list --branch main` and watch it.** CI went red for three pushes twice this week because nobody looked. Never say "should be green."
- **The import script does not run the engine.** A matchup's `computedTally` refreshes only on the next sync tick. Read state after a tick, never right after an import.
- **Verify before asserting, and distrust confident claims from earlier in the conversation** — including mine. This week's wrong-but-confident list included "CI only runs vitest," "API access is live," and two Round 1 margins.
- **Codex division of labor (Scott's preference):** hand Codex well-specified chunks with a recorded oracle (`docs/specs/` has the template); keep design, integration, security-sensitive paths, and all live verification yourself — its sandbox can't bind ports or reach the network. Use `-m gpt-5.5`; `gpt-5.4` 400s on this account. Save specs into the repo; a run dies with the session.
- **Yahoo API gotchas** are listed in `docs/status.md`'s top block. The one most likely to bite again: stat `value` is typed by the week's state (strings when complete, JSON numbers mid-week, `""` pre-game).
- Scott is the author; push back honestly; no flattery; build slow, build right.

## Useful commands
```bash
gh run list --branch main --limit 3
node --env-file=.env.local --experimental-strip-types scripts/import-stats.ts --dry-run <csv>   # fallback only
codex exec -m gpt-5.5 -s read-only --skip-git-repo-check "$(cat <brief>.md)"                      # reviews
codex exec -m gpt-5.5 -s workspace-write --skip-git-repo-check "$(cat docs/specs/<spec>.md)"      # builds
```
Dev server: `preview_start` with `loser-bowl-dev` (`.claude/launch.json`). `.env.local` has `LEAGUE_KEY`, `YAHOO_*`, admin vars — all also in Vercel Production.
