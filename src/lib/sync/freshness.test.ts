import { describe, expect, it } from "vitest";

import {
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
  backoffMs,
  freshnessWindow,
  isStale,
} from "./freshness";

const NOW = new Date("2026-09-10T12:00:00Z");
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000);

describe("freshnessWindow / isStale", () => {
  it("uses 30 minutes during bracket weeks", () => {
    expect(freshnessWindow("bracket")).toBe(30 * 60 * 1000);
    expect(isStale(minutesAgo(29), "bracket", NOW)).toBe(false);
    expect(isStale(minutesAgo(30), "bracket", NOW)).toBe(true);
  });

  it("uses 6 hours during the race", () => {
    expect(isStale(minutesAgo(5 * 60), "race", NOW)).toBe(false);
    expect(isStale(minutesAgo(6 * 60), "race", NOW)).toBe(true);
  });

  it("never syncs after a champion is crowned", () => {
    expect(isStale(null, "champion", NOW)).toBe(false);
    expect(isStale(minutesAgo(10_000), "champion", NOW)).toBe(false);
  });

  it("treats a never-synced state as stale outside champion", () => {
    expect(isStale(null, "race", NOW)).toBe(true);
    expect(isStale(null, "bracket", NOW)).toBe(true);
  });
});

describe("backoffMs", () => {
  it("doubles from a 5-minute base and caps at 6 hours", () => {
    expect(backoffMs(0)).toBe(0);
    expect(backoffMs(1)).toBe(BACKOFF_BASE_MS);
    expect(backoffMs(2)).toBe(BACKOFF_BASE_MS * 2);
    expect(backoffMs(4)).toBe(BACKOFF_BASE_MS * 8);
    expect(backoffMs(12)).toBe(BACKOFF_CAP_MS);
    expect(backoffMs(31)).toBe(BACKOFF_CAP_MS);
  });
});
