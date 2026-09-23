# Loser Bowl — paste-ready handoff prompt

Copy everything below the line into a fresh session.

---

I'm continuing work on loser-bowl (`~/Development/loser-bowl`), a Next.js 16 + Drizzle/Neon
app on Vercel at https://loserbowl.landermedia.com that runs a fantasy-baseball consolation
bracket for Lander's League. A $50 pot rides on the results, so data integrity is a
correctness requirement, not a nice-to-have. Public repo `sc8tty/loser-bowl`.

Start by reading the top block of `docs/status.md` ("Where things stand" / the 2026-09-23
sections / "Known open items" / "Yahoo API facts"). It is the current handoff and is
authoritative over anything I say here or anything in memory. Then `git pull` and
`gh run list --branch main --limit 3` to confirm main is green before touching anything.

## Current state (verified 2026-09-23)

* The site syncs itself from the Yahoo API. A page visit schedules a sync via `after()` when
  data is >30 min old; it pulls every started bowl week, diffs, writes only changed rows,
  then runs the engine's housekeeping. Do not propose manual stat pulls — the CSV path is
  fallback only.
* **The Final (Week 26, Sep 21–27) is live: Eat The Rich vs Me So Hoerner.**
* **A scoring rule was wrong and a Round 1 result changed.** The innings-minimum policy
  forfeited only ERA and WHIP; Yahoo forfeits *every* pitching category (7 here: W, BB, K,
  ERA, WHIP, K/9, NSVH). Fixed in `5363c54`. Sheatriptease pitched 12.0 of 24.0 IP and had
  been recorded beating Trout's Honor 8-5; correctly scored they lose 6-8, so **Trout's
  Honor should have advanced**. `r1m3` and `r2m2` were replayed against the live DB on 9/23
  and now read Trout's Honor 8-6-1 and Trout's Honor vs Me So Hoerner 0-7-8.
* **The Final was never affected.** Me So Hoerner beats Trout's Honor under every scenario
  tested — as recorded (12-2-1), with the correct forfeit (7-0-8), with no forfeit, and even
  with every benched starting pitcher restored from Yahoo's daily rosters (7-6-2).
* `regular_season_matchups` had been **empty all season**, so the tiebreaker silently skipped
  head-to-head and fell through to season totals. Guarded in `8a2d7fc` (empty table now
  throws) and populated via the new `npm run import:matchups:yahoo` — 184 matchups, weeks
  1–23.
* CI runs vitest + typecheck + lint + build + Playwright; 248 tests green at `fb3b64f`.

## Open items, in priority order

1. **Replay `r1m4` and `r2m1`** — they still hold pre-fix ERA/WHIP-only tallies, so their box
   scores credit below-minimum teams with forfeited categories and their cards read "forfeits
   2 pitching categories" instead of 7. Winners do NOT change; verified expected results are
   **14-1-0** and **14-0-1**. Exact procedure is in `docs/status.md` open item 1. The write
   was refused twice by Claude Code's permission classifier ("Modify Shared Resources") — it
   needs a Bash permission rule or a manual run.
2. **Watch the Final close out** Sunday night 9/27 → Monday: `provisional` on the first tick
   after the week ends, `final` 24h later. If both finalists finish under 24 IP, all 7
   pitching categories tie and only the 8 batting categories decide it — 8 is even, so a dead
   tie is possible. That path is safe now: head-to-head is populated and favors Eat The Rich
   (they beat Hoerner in weeks 1 and 16).
3. Post-season: the visit-sync freshness clock (`docs/status.md` item 3).

## Rules for this project, learned the hard way

* **After every push, run `gh run list --branch main` and watch it.** Never say "should be
  green."
* **Verify before asserting, including my claims and your own earlier ones.** This project's
  wrong-but-confident list is long. Two examples from 9/23: I said the hypothetical
  Trout's-vs-Hoerner matchup couldn't be reconstructed (it could — `stat_lines` holds all 16
  teams every week), and a tiebreaker script gave the wrong winner because it read an empty
  table without noticing.
* **Treat "UNVERIFIED"/"TODO: confirm" comments in scoring paths as open bugs.** That comment
  is exactly how the innings-minimum bug shipped and decided a real bracket.
* **The import script does not run the engine.** A matchup's `computedTally` refreshes only
  on the next sync tick. Read state after a tick, never right after an import.
* Yahoo API gotchas are in `docs/status.md`'s top block — including how to pull dated rosters
  and per-player stats, and why ERA/WHIP numerators have to be derived as ratio × innings.
* Scott is the author; push back honestly; no flattery; build slow, build right.
* Codex division of labor: hand it well-specified chunks with a recorded oracle
  (`docs/specs/` has the template); keep design, integration, security-sensitive paths and
  all live verification yourself. Use `-m gpt-5.5` and `-o <file>` so the report survives the
  session.

## Useful commands

```
gh run list --branch main --limit 3
npm run import:matchups:yahoo -- --dry-run
```

Dev server: `preview_start` with `loser-bowl-dev` (`.claude/launch.json`). `.env.local` has
`LEAGUE_KEY`, `YAHOO_*`, admin vars — all also in Vercel Production. Note `CRON_SECRET` is in
Vercel but NOT in `.env.local`, so trigger syncs by hitting the live site rather than
`/api/sync`.
