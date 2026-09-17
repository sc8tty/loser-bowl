No P1s found.

### [P2] Public page views can run data-changing sync and consume failure backoff
- **Where:** `src/lib/sync/trigger.ts:343` quotes `isStale(...) || ...`, then `src/lib/sync/trigger.ts:346` quotes `after(async () => { await runSync("visit", dbSyncDeps()); })`
- **Attack:** An unauthenticated stranger repeatedly requests `/` or `/matchup/<id>` when data is stale. That schedules `runSync("visit")`; on Yahoo/API/config failures, `src/lib/sync/engine.ts:90` increments `consecutiveFailures` and `src/lib/sync/engine.ts:101` writes `nextRetryAt`, which `src/lib/sync/lock.ts:31` then honors for all triggers.
- **Impact:** Public traffic cannot choose winners, but it can cause real writes to `stat_lines`, `matchups`, `teams.final_seed`, `sync_state`, and `sync_runs`, and during an upstream failure can push retries into longer backoff so results stay stale.
- **Confidence:** 8/10. Runtime logs showing Vercel `after()` behavior and Yahoo failure rates would raise/lower it.
- **Fix:** Move visitor sync behind cron/admin only, or make visitor sync enqueue a protected job that does not count toward global failure backoff; at minimum do not let `visit` failures advance `nextRetryAt`.

### [P2] Login throttling can be bypassed if forwarded IP headers are client-controlled
- **Where:** `src/lib/admin/throttle.ts:58` quotes `headers.get("x-forwarded-for")?.split(",")[0]`; `src/app/api/admin/login/route.ts:44` quotes `const ip = clientIpFromHeaders(request.headers)`
- **Attack:** A stranger posts to `/api/admin/login` with a different leading `X-Forwarded-For` value on each attempt. The in-memory throttle map sees a new key and permits more guesses.
- **Impact:** Admin password brute-force protection can be bypassed under header-preserving deployment/proxy behavior.
- **Confidence:** 6/10. Production proxy canonicalization would lower this; observing raw request headers in Vercel would raise it.
- **Fix:** Use a trusted platform-provided client IP, or a durable rate limiter keyed by account plus verified IP; ignore client-supplied forwarded headers.

### [P2] Standings import can leave seed-critical team rows partially updated
- **Where:** `scripts/import-standings.ts:62` quotes `for (const row of parsed) { await db.update(schema.teams)... }`; `scripts/lib/import-common.ts:22` quotes `drizzle(neon(databaseUrl), { schema })`
- **Attack:** An operator runs the production standings import and the process/network fails after some row updates. A malicious league member’s realistic role is social/preconditioned: get the admin to run an import during uncertainty, then public sync can lock seeds from mixed old/new standings.
- **Impact:** `teams.current_rank` and regular-season totals can be inconsistent, affecting seed lock and bracket results.
- **Confidence:** 8/10. A runtime transaction wrapper or DB-side atomic procedure would lower it; current `neon-http` import DB raises it.
- **Fix:** Replace the loop with one atomic `UPDATE ... FROM (VALUES ...)`, or run scripts through the WebSocket transaction-capable DB client.

### [P2] One-off cleanup script can destroy production bracket state without a guard
- **Where:** `scripts/_oneoff-cleanup-placeholder-teams.ts:32` quotes `.delete(schema.matchups)`, and `scripts/_oneoff-cleanup-placeholder-teams.ts:49` quotes `db.update(schema.teams).set({ finalSeed: null })`
- **Attack:** Anyone with repo access and production `.env.local` runs the script, intentionally or accidentally.
- **Impact:** Deletes every matchup, resets seed-lock fields, clears all final seeds, and deletes placeholder teams.
- **Confidence:** 9/10. It is explicit destructive code; only execution access is the precondition.
- **Fix:** Remove the script or require a production-specific confirmation env var plus dry-run default and DB host allowlist.

### [P3] Stat parser accepts unbounded numeric strings that can produce `NaN`/`Infinity`
- **Where:** `src/lib/stats/stat-rows.ts:26` quotes `.regex(/^\\d+$/...)`; `src/lib/stats/stat-rows.ts:153` quotes `const atBats = Number(stats.at_bats)` and `src/lib/stats/stat-rows.ts:166` quotes `stats.avg = ratio(...)`
- **Attack:** A bad Yahoo response or imported CSV supplies extremely large digit strings for support stats like `at_bats` and `batting_hits`.
- **Impact:** Values pass regex validation, then `Number()` can become `Infinity`; `Infinity / Infinity` produces `"NaN"` for computed AVG, which can break or distort later matchup comparison.
- **Confidence:** 8/10. Existing tests around absurd values would lower it.
- **Fix:** Parse all numeric stats to finite safe integers before storing; add plausible per-week caps and reject non-finite derived ratios.

## Checked and found sound

- Admin mutation routes call `requireAdminMutation`; proxy matches `/admin/:path*`, `/api/admin/:path*`, and `/api/sync`.
- `/api/sync` GET requires `CRON_SECRET` bearer; POST requires admin auth plus Origin check.
- OAuth start requires admin auth; callback verifies the `yahoo_oauth_state` cookie with `timingSafeEqual` before storing tokens.
- `/oauth/done` only renders fixed messages from `status`; it does not decide connection state.
- Token status rendering selects only `expiresAt` and `updatedAt`; admin dashboard does not select token columns.
- Token write errors are wrapped in `storeTokens`, and sync errors redact Drizzle `params:`.
- Admin cookie is `httpOnly`, `secure`, `sameSite: "strict"`; session signatures use HMAC with timing-safe comparison.
- App runtime DB uses `drizzle-orm/neon-serverless` with `ws`, so sync/admin transactions are not using `neon-http`.

## Could not assess without network/runtime

- Actual env strength for `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, and `CRON_SECRET`.
- Production proxy behavior for `X-Forwarded-For`.
- Yahoo API error bodies and whether they ever echo sensitive request details.
- Live DB permissions, migrated constraints, and current table contents.
- Dependency advisories. From memory, I do not know of a published advisory affecting the direct pinned versions here, but this needs `npm audit`/advisory DB access to verify.