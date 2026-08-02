import { backoffMs } from "./freshness";

export type SyncTrigger = "visit" | "cron" | "admin" | "backfill";

export type SyncSource = () => Promise<Record<string, unknown> | void>;

/**
 * Narrow seams so the orchestration is pure and testable; the DB-bound
 * implementations live in lock.ts. Issue 4B plugs the Yahoo source in here.
 */
export type SyncDeps = {
  claimLock: (now: Date) => Promise<boolean>;
  releaseLock: (outcome: {
    success: boolean;
    wroteData: boolean;
    nextRetryAt: Date | null;
    now: Date;
  }) => Promise<void>;
  recordRun: (run: {
    trigger: SyncTrigger;
    status: "success" | "error";
    startedAt: Date;
    finishedAt: Date;
    error: string | null;
    detail: Record<string, unknown>;
  }) => Promise<void>;
  consecutiveFailures: () => Promise<number>;
  source: SyncSource;
  now?: () => Date;
};

export type SyncOutcome =
  | { ran: false; reason: "lock_held" }
  | { ran: true; status: "success" }
  | { ran: true; status: "error"; error: string };

export async function runSync(
  trigger: SyncTrigger,
  deps: SyncDeps,
): Promise<SyncOutcome> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now();

  const claimed = await deps.claimLock(startedAt);

  if (!claimed) {
    return { ran: false, reason: "lock_held" };
  }

  try {
    const detail = (await deps.source()) ?? {};
    const wroteData = detail.wroteData === true;
    const finishedAt = now();

    await deps.recordRun({
      trigger,
      status: "success",
      startedAt,
      finishedAt,
      error: null,
      detail,
    });
    await deps.releaseLock({
      success: true,
      wroteData,
      nextRetryAt: null,
      now: finishedAt,
    });

    return { ran: true, status: "success" };
  } catch (error) {
    const finishedAt = now();
    const message = error instanceof Error ? error.message : String(error);
    const failures = (await deps.consecutiveFailures()) + 1;
    const nextRetryAt = new Date(finishedAt.getTime() + backoffMs(failures));

    await deps.recordRun({
      trigger,
      status: "error",
      startedAt,
      finishedAt,
      error: message,
      detail: { consecutiveFailures: failures },
    });
    await deps.releaseLock({
      success: false,
      wroteData: false,
      nextRetryAt,
      now: finishedAt,
    });

    return { ran: true, status: "error", error: message };
  }
}
