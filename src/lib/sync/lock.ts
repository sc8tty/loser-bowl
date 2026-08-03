import "server-only";

import { desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { syncRuns, syncState } from "@/db/schema";
import type { SyncDeps, SyncTrigger } from "./engine";
import { processSeedLock } from "./seedLock";

export const LOCK_TTL_MS = 2 * 60 * 1000;

/**
 * Atomic claim: one UPDATE is both the concurrency guard and the public-visit
 * stampede limit (PRD). No row returned → someone else holds the lock, or
 * we're inside the failure backoff window.
 */
export async function claimSyncLock(now: Date): Promise<boolean> {
  const db = getDb();
  const expiry = new Date(now.getTime() + LOCK_TTL_MS);

  const claimed = await db
    .update(syncState)
    .set({ lockExpiresAt: expiry, lastAttempt: now })
    .where(
      sql`${syncState.id} = 1
        AND (${syncState.lockExpiresAt} IS NULL OR ${syncState.lockExpiresAt} < now())
        AND (${syncState.nextRetryAt} IS NULL OR ${syncState.nextRetryAt} <= now())`,
    )
    .returning({ id: syncState.id });

  return claimed.length > 0;
}

export async function releaseSyncLock(outcome: {
  success: boolean;
  wroteData: boolean;
  nextRetryAt: Date | null;
  now: Date;
}): Promise<void> {
  const db = getDb();

  await db
    .update(syncState)
    .set({
      lockExpiresAt: null,
      nextRetryAt: outcome.nextRetryAt,
      // last_success advances only when the source actually wrote data —
      // a successful no-op must not tell the public page "Updated just now"
      // (cold-review P2-7).
      ...(outcome.success && outcome.wroteData
        ? { lastSuccess: outcome.now }
        : {}),
    })
    .where(eq(syncState.id, 1));
}

export async function recordSyncRun(run: {
  trigger: SyncTrigger;
  status: "success" | "error";
  startedAt: Date;
  finishedAt: Date;
  error: string | null;
  detail: Record<string, unknown>;
}): Promise<void> {
  const db = getDb();

  await db.insert(syncRuns).values({
    trigger: run.trigger,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: run.finishedAt.getTime() - run.startedAt.getTime(),
    error: run.error,
    detail: run.detail,
  });
}

/**
 * Consecutive trailing error runs — drives the exponential backoff. Only real
 * sync triggers count: import/backfill scripts log to the same table, and an
 * iterated broken CSV must not inflate the Yahoo backoff (cold-review P2-2).
 */
export async function countConsecutiveFailures(): Promise<number> {
  const db = getDb();
  const recent = await db
    .select({ status: syncRuns.status })
    .from(syncRuns)
    .where(inArray(syncRuns.trigger, ["visit", "cron", "admin"]))
    .orderBy(desc(syncRuns.id))
    .limit(16);

  let failures = 0;

  for (const run of recent) {
    if (run.status !== "error") {
      break;
    }
    failures += 1;
  }

  return failures;
}

/**
 * The no-op source that ships with the shell. Issue 4B replaces this with the
 * Yahoo sync pipeline; manual mode never needs it (importers write directly).
 * wroteData: false — a no-op must never advance last_success.
 */
export async function noopSource(): Promise<Record<string, unknown>> {
  return {
    source: "noop",
    note: "sync shell — real source lands with Issue 4B",
    wroteData: false,
  };
}

export async function defaultSyncSource(): Promise<Record<string, unknown>> {
  const seedLock = await processSeedLock();

  return {
    source: "default",
    note: "sync shell — real Yahoo source lands with Issue 4B",
    seedLock,
    wroteData: seedLock.wroteData,
  };
}

export function dbSyncDeps(overrides: Partial<SyncDeps> = {}): SyncDeps {
  return {
    claimLock: claimSyncLock,
    releaseLock: releaseSyncLock,
    recordRun: recordSyncRun,
    consecutiveFailures: countConsecutiveFailures,
    source: defaultSyncSource,
    ...overrides,
  };
}
