# Adversarial security review brief — Loser Bowl (2026-09-17)

You are a fresh-context security reviewer for a small Next.js 16 + Drizzle/Neon app that
runs a fantasy-baseball consolation bracket. A $50 pot rides on its results, so data
integrity is a correctness requirement. You have a read-only sandbox with no network; you
cannot run the app or reach the DB. Read the code. Do not edit anything.

Assume a motivated league member who wants to (a) change a result, (b) read or use the
Yahoo OAuth tokens, (c) take over the admin session, or (d) break the sync so results stop
updating. Also consider an unauthenticated stranger on the public internet.

## Scope (read all of these)
- OAuth flow: `src/app/api/oauth/start/`, `src/app/api/oauth/callback/`, `src/app/oauth/`,
  `src/lib/yahoo/oauth.ts`, `src/lib/yahoo/tokens.ts`, `src/lib/yahoo/client.ts`
- Sync: `src/app/api/sync/route.ts`, `src/lib/sync/*.ts` (engine, lock, trigger,
  yahooSource, matchupCompute, seedLock, freshness)
- Admin auth: `src/proxy.ts`, `src/app/api/admin/**`, `src/app/admin/**`, `src/lib/admin/*.ts`
  (session, csrf, guard, throttle, state, responses)
- Input validation: `parseStatsRow` in `src/lib/stats/stat-rows.ts` and its callers in
  `src/lib/sync/yahooSource.ts` and `scripts/import-stats.ts`
- Scripts: everything in `scripts/` (these run with the production DB URL from `.env.local`)
- Schema: `src/db/schema.ts`
- Dependencies: `package.json` + `package-lock.json` — flag any dependency you know to have a
  published advisory at the pinned version (you have no network, so say what you know and
  how confident you are; do not invent CVE numbers)

Skip `*.test.ts`, `e2e/`, `src/components/`, and styling.

## What to look for, in priority order
1. Anything that lets a non-admin write to `matchups`, `results`, `stat_lines`, `teams`,
   `oauth_tokens`, `sync_runs`, or the seed lock.
2. Token exposure: any path where `oauth_tokens.access_token` / `refresh_token` reaches a
   page payload, a JSON response, a log line, or an error message. (One instance of this —
   a `DrizzleQueryError` message embedding bound params — was fixed today in `tokens.ts` +
   `engine.ts`; check the fix is complete and look for others.)
3. Admin session: cookie attributes, session fixation, CSRF on every state-changing admin
   route, login throttling bypass, timing-safe comparisons, logout completeness.
4. OAuth: state binding, redirect handling, code reuse, what `/oauth/done` trusts.
5. Sync integrity: can `/api/sync` be triggered by anyone in a way that matters? Lock
   race conditions; a partial write leaving the DB inconsistent (the driver is
   `neon-serverless` over WebSocket — `src/db/index.ts` — so `db.transaction()` is real;
   check that every multi-row write that needs one is inside one); the
   provisional → final 24-hour window; the `after()`-scheduled visit sync.
6. `parseStatsRow`: type confusion (Yahoo sends stat values as strings, JSON numbers, or
   `""` depending on the week's state), NaN/Infinity, negative or absurd values, unknown
   stat ids, prototype-pollution shapes in the JSON.
7. Scripts: SQL built from CSV/argv, path handling, anything destructive without a guard.
8. Next.js 16 specifics: `proxy.ts` matching gaps (routes that bypass it), `dynamic`
   settings, server-action or route-handler exposure.

## Output format (strict)
Write Markdown. For each finding:

```
### [P1|P2|P3] <one-line title>
- **Where:** `path:line`
- **Attack:** concrete steps an attacker takes; who they need to be
- **Impact:** what they get
- **Confidence:** N/10, and what would raise or lower it
- **Fix:** minimal change
```

P1 = a non-admin can change results, read tokens, or take over admin. P2 = a real weakness
needing a precondition (e.g. an admin's cooperation, a race). P3 = hygiene.

Then a section `## Checked and found sound` listing, briefly, the specific things you
verified that are fine, so the author knows what was covered. Then
`## Could not assess without network/runtime` for anything you had to skip.

Do not pad. If there are no P1s, say so in the first line. False positives cost the author
verification time; a wrong P1 is worse than a missed P3. Quote the code you are relying on.
