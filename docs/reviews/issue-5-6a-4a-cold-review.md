# Cold review of 531a4bd (6A), c952b29 (engine fixes), 7ee55cc (4A) — 2026-08-02

Reviewer: fresh-context Claude subagent (solo, no workflow fan-out), same session's own
commits under review. Verdict per commit: NEEDS FIXES on all three. Full findings preserved
in git history (agent transcript); this doc records what shipped and why.

## P1 — none found.

## P2 — all fixed

1. **6A: zero-IP/zero-AB fabricated best/worst-possible ratios.** `ratio()` and the
   ERA/WHIP branches in `scripts/lib/stat-rows.ts` now emit `"-"` (Yahoo's own placeholder,
   parses to `null`) instead of `"0.00"`/`"0.000"` — exactly the abandoned-lineup scenario
   manual mode exists to handle. Regression tests added.
2. **6A × 4A: import dry-run/error logging poisoned the sync backoff counter.**
   `countConsecutiveFailures` now filters to `trigger IN ('visit','cron','admin')`
   (`src/lib/sync/lock.ts`), and `--dry-run` no longer writes to `sync_runs` at all
   (`logSyncRun` short-circuits — also closes P3-7).
3. **6A: duplicate team_id passed standings validation.** `assertCompleteRanks` now asserts
   16 unique team ids, not just complete ranks.
4. **c952b29: half the max-review fixes shipped without regression tests**, contradicting
   the commit message and the PRD's test-first mandate. Closed: comparator mode/policy
   throws, tiebreaker garbage-input throws, and the numeric-IP ambiguity now all have
   dedicated tests (`comparator.test.ts`, `tiebreakers.test.ts`).
5. **c952b29: the H fix (final-mode null throw) fired before the innings-minimum policy**,
   so a legitimate below-minimum forfeit (real ERA "-" on a real 2025-style zero-IP week)
   threw instead of forfeiting. Policy now evaluates first; the throw only fires when no
   policy decision applies.
6. **c952b29: the E fix (missing-IP throw) was not mode-aware**, contradicting live mode's
   documented tolerance for in-progress weeks. `InningsMinimumPolicyInput` now carries
   `mode`; live mode returns `{applies: false}` on missing IP instead of throwing.
7. **4A: the noop source advanced `last_success`**, so the public page told viewers
   "Updated just now" when nothing had synced. `SyncDeps.releaseLock` now takes a
   `wroteData` flag; only a source that reports `wroteData: true` advances `last_success`.
   The shipped `noopSource` reports `false`.

## P3 — fixed (cheap, worth doing now)

- Numerics now route through `parseInningsPitched` on the comparator's compare path too
  (not just the innings-minimum policy), so `100.2` (number) vs `"100.1"` (string) throws
  instead of comparing 100.2 against 100.333.
- Final mode now throws when a category is missing on **both** sides, not just one-sided —
  closes the settings/stat-key-mismatch silent-tie hole.
- `admin_override_corrected` now settles with the *corrected* result fingerprint (the stats
  the admin actually accepted), not the superseded original's.
- CSV header rows with a trailing delimiter (empty column name) now fail fast with a clear
  message instead of a confusing per-row field-count error.
- `stat_lines` upsert on conflict now clears `sync_run_id` to null (import provenance, not a
  stale Yahoo pointer).
- `/api/sync`'s bearer-token check now uses `crypto.timingSafeEqual`.
- `vercel.json` pins `regions: ["iad1"]` alongside the Neon us-east branch per the PRD.

## Deferred (noted for the issues that build on this)

- Lock release has no ownership token (safe today only because `maxDuration` 60s <
  `LOCK_TTL_MS` 120s) — revisit if either value changes.
- Backoff-blocked claims are indistinguishable from lock-held claims; Issue 11's "re-sync
  now" needs an explicit bypass + honest reason, not silent no-op.
- `import-standings` runs 16 non-transactional UPDATEs; acceptable for a rare manual-mode
  operation, revisit if it becomes a batch write.
- Issue 9 must apply matchup state + `advance_winner` atomically (the frozen-state guard
  removed re-emission on crash-and-retry).
- Issue 9 must guarantee a standings sync/import ran before any tiebreak evaluates (the
  stricter tiebreakers now throw on `{}` outcome totals, which is correct but assumes data
  exists).
