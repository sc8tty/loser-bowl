import { describe, expect, it, vi } from "vitest";

import { runSync, type SyncDeps } from "./engine";
import { BACKOFF_BASE_MS } from "./freshness";

const NOW = new Date("2026-09-10T12:00:00Z");

function fakeDeps(overrides: Partial<SyncDeps> = {}): SyncDeps & {
  runs: Parameters<SyncDeps["recordRun"]>[0][];
  releases: Parameters<SyncDeps["releaseLock"]>[0][];
} {
  const runs: Parameters<SyncDeps["recordRun"]>[0][] = [];
  const releases: Parameters<SyncDeps["releaseLock"]>[0][] = [];

  return {
    runs,
    releases,
    claimLock: async () => true,
    releaseLock: async (outcome) => {
      releases.push(outcome);
    },
    recordRun: async (run) => {
      runs.push(run);
    },
    consecutiveFailures: async () => 0,
    source: async () => ({ ok: true }),
    now: () => NOW,
    ...overrides,
  };
}

describe("runSync", () => {
  it("PRD AC: two simultaneous cold visits produce exactly one source invocation", async () => {
    let lockHeld = false;
    const source = vi.fn(async () => ({}));
    const sharedClaim = async () => {
      if (lockHeld) {
        return false;
      }
      lockHeld = true;
      return true;
    };

    const depsA = fakeDeps({ claimLock: sharedClaim, source });
    const depsB = fakeDeps({ claimLock: sharedClaim, source });

    const [outcomeA, outcomeB] = await Promise.all([
      runSync("visit", depsA),
      runSync("visit", depsB),
    ]);

    expect(source).toHaveBeenCalledTimes(1);
    expect([outcomeA.ran, outcomeB.ran].sort()).toEqual([false, true]);
  });

  it("records a success run and releases with last_success", async () => {
    const deps = fakeDeps();

    const outcome = await runSync("cron", deps);

    expect(outcome).toEqual({ ran: true, status: "success" });
    expect(deps.runs).toHaveLength(1);
    expect(deps.runs[0]).toMatchObject({
      trigger: "cron",
      status: "success",
      error: null,
    });
    expect(deps.releases).toEqual([
      { success: true, nextRetryAt: null, now: NOW },
    ]);
  });

  it("records an error run, sets exponential backoff, and still releases the lock", async () => {
    const deps = fakeDeps({
      source: async () => {
        throw new Error("yahoo exploded");
      },
      consecutiveFailures: async () => 2,
    });

    const outcome = await runSync("visit", deps);

    expect(outcome).toEqual({ ran: true, status: "error", error: "yahoo exploded" });
    expect(deps.runs[0]).toMatchObject({
      status: "error",
      error: "yahoo exploded",
      detail: { consecutiveFailures: 3 },
    });
    expect(deps.releases).toHaveLength(1);
    expect(deps.releases[0].success).toBe(false);
    expect(deps.releases[0].nextRetryAt?.getTime()).toBe(
      NOW.getTime() + BACKOFF_BASE_MS * 4,
    );
  });

  it("exits silently without running the source when the lock is held", async () => {
    const source = vi.fn(async () => ({}));
    const deps = fakeDeps({ claimLock: async () => false, source });

    const outcome = await runSync("visit", deps);

    expect(outcome).toEqual({ ran: false, reason: "lock_held" });
    expect(source).not.toHaveBeenCalled();
    expect(deps.runs).toHaveLength(0);
    expect(deps.releases).toHaveLength(0);
  });
});
