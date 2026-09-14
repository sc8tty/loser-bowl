# Task: Yahoo Fantasy API client for loser-bowl (read-only, one endpoint)

Repo: /Users/scottparish/Development/loser-bowl (TypeScript strict, vitest). Read the named
files before writing anything and match their conventions.

## What exists that you MUST reuse
- `src/lib/yahoo/tokens.ts` → `getValidAccessToken()` returns a bearer token, refreshing
  it if needed. Call this; never touch the token table yourself.
- `src/lib/yahoo/config.ts` → `getYahooConfig()` (pattern for env + a `Missing*Error`).
- `src/config/league.ts` → `LEAGUE_CONFIG.leagueKey` (string | null, from `LEAGUE_KEY`).
- Two RECORDED live responses are your test fixtures — do not invent shapes:
  `src/lib/yahoo/__fixtures__/league-teams-stats-week24.json` (real values)
  `src/lib/yahoo/__fixtures__/league-teams-stats-week25-empty.json` (before any games)
- Relative imports inside `src/lib/yahoo/` use an explicit `.ts` suffix (see `oauth.ts`,
  `tokens.ts`). Do the same. This is required so `scripts/` can load the lib under plain
  `node --experimental-strip-types`.

## Deliverable 1: `src/lib/yahoo/client.ts`

### `fetchLeagueWeekStats(week: number): Promise<YahooTeamWeekStats[]>`
GET `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/teams/stats;type=week;week=${week}?format=json`
with `Authorization: Bearer <token>`. Throw a `MissingLeagueKeyError` (same shape as the
existing Missing*Error classes) if `LEAGUE_CONFIG.leagueKey` is null. On non-2xx, throw an
Error with the HTTP status and, if the body parses as JSON with `error.description`, that
description — never the bearer token, never the raw body.

### Parsing — the response nesting (verified against the fixtures)
```
fantasy_content.league[1].teams          // object, NOT array
  .count                                  // string, e.g. "16"
  ."0" .. ."15"                           // keys are stringified indexes
    .team[0]                              // ARRAY of single-key objects, e.g.
                                          //   [{team_key:"469.l.16468.t.12"},{team_id:"12"},{name:"SLUMP BUSTERS"}, [], {url:...}, ...]
                                          //   (some entries are empty arrays — skip non-objects)
    .team[1].team_stats.week              // string "24"
    .team[1].team_stats.stats[]           // [{stat:{stat_id:"7", value:"24"}}, ...]
```
Iterate `0 .. count-1`. Do NOT assume the object's own key order.

### Stat-id → slug map (the league's categories; these are all Yahoo returns)
| stat_id | slug           | notes                                            |
|---------|----------------|--------------------------------------------------|
| 7       | r              |                                                  |
| 10      | 2b             |                                                  |
| 11      | 3b             |                                                  |
| 12      | hr             |                                                  |
| 13      | rbi            |                                                  |
| 16      | sb             |                                                  |
| 55      | ops            | ratio                                            |
| 28      | w              |                                                  |
| 39      | bb             |                                                  |
| 42      | k              |                                                  |
| 26      | era            | ratio                                            |
| 27      | whip           | ratio                                            |
| 57      | k9             | ratio                                            |
| 90      | nsvh           | can be NEGATIVE, e.g. "-2"                       |
| 60      | (split)        | "H/AB" e.g. "40/190" → batting_hits=40, at_bats=190 |
| 50      | innings_pitched| Yahoo thirds notation "32.1"; pass through as-is |
| 3       | (ignore)       | AVG — the importer recomputes it                 |
Unknown stat_ids: ignore (do not throw) — a league setting change must not take the sync down.

### Output type
```ts
export type YahooTeamWeekStats = {
  teamKey: string;          // "469.l.16468.t.12"
  teamName: string;
  week: number;
  stats: Record<string, string>;   // slug -> string, EXACTLY the importer's CSV-cell format
};
```
`stats` must contain every slug in the table (except AVG) so it can be fed to the existing
`parseStatsRow` in `scripts/lib/stat-rows.ts` unchanged. Value formatting rules:
- Counting stats: the integer as a string ("24", "-2").
- Ratios (ops/era/whip/k9): Yahoo's string as-is (".689", "4.73"). If Yahoo gives "-",
  keep "-".
- **Empty string** (the before-any-games fixture has EVERY value as ""): counting stats and
  at_bats/batting_hits become "0", innings_pitched becomes "0.0", ratios become "-".
  This mirrors the documented transcription rule for a team with no games yet. Never emit
  "" and never emit "0.00" for an undefined ratio.
- "H/AB" of "" or "-/-" → at_bats "0", batting_hits "0".

## Deliverable 2: `src/lib/yahoo/client.test.ts` (vitest, mock `fetch` and
`getValidAccessToken`; look at `tokens.test.ts` for how the existing tests mock)
Cover:
- week24 fixture → 16 teams; SLUMP BUSTERS (t.12) yields exactly
  `r=24 2b=13 3b=0 hr=6 rbi=21 sb=5 ops=.689 w=2 bb=15 k=36 era=4.73 whip=1.39 k9=10.02 nsvh=3 at_bats=190 batting_hits=40 innings_pitched=32.1`
  and Sheatriptease (t.4) yields `nsvh=-2` (negative preserved)
- week25-empty fixture → 16 teams, every counting stat "0", ratios "-",
  innings_pitched "0.0", at_bats/batting_hits "0"
- every returned `stats` object passes the existing `parseStatsRow` from
  `scripts/lib/stat-rows.ts` (import it and call it with the seeded categories from
  `src/config/categories.seed.ts` and a knownTeamIds set of the fixture team ids mapped to
  ANY slug — the point is that the VALUE FORMAT is accepted). This is the contract that
  matters most.
- unknown stat_id present → ignored, no throw
- HTTP 403 with `{error:{description:"..."}}` → thrown message contains 403 and the
  description, does NOT contain the token
- missing LEAGUE_KEY → MissingLeagueKeyError

## Constraints
- No new dependencies. No `any`. Comments only for non-obvious WHY (the empty-string rule
  and the `teams` object-not-array quirk qualify).
- Do not modify anything outside `src/lib/yahoo/client.ts` and its test.
- Do not attempt any real network call or start a server.
- Run `npx tsc --noEmit`, `npm run lint`, `npx vitest run` — all must pass. Print a summary.
