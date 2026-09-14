import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [] as string[],
  yahoo: vi.fn(),
  seedLock: vi.fn(),
  matchups: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/yahoo/client", () => ({ fetchLeagueWeekStats: vi.fn() }));
vi.mock("./yahooSource", () => ({ syncYahooStats: state.yahoo }));
vi.mock("./seedLock", () => ({ processSeedLock: state.seedLock }));
vi.mock("./matchupCompute", () => ({ processMatchups: state.matchups }));

import { createDefaultSyncSource } from "./lock";

const fetchWeek = vi.fn();

beforeEach(() => {
  state.calls = [];
  state.yahoo.mockReset().mockImplementation(async () => {
    state.calls.push("yahoo");
    return { weeks: [], wroteData: false };
  });
  state.seedLock.mockReset().mockImplementation(async () => {
    state.calls.push("seedLock");
    return { wroteData: false };
  });
  state.matchups.mockReset().mockImplementation(async () => {
    state.calls.push("matchups");
    return { wroteData: false };
  });
});

describe("defaultSyncSource", () => {
  it("fetches Yahoo before the engine housekeeping, so it computes on fresh stats", async () => {
    await createDefaultSyncSource({ fetchWeek })();

    expect(state.calls).toEqual(["yahoo", "seedLock", "matchups"]);
  });

  it("reports wroteData when only the Yahoo step wrote", async () => {
    state.yahoo.mockResolvedValue({ weeks: [], wroteData: true });

    const detail = await createDefaultSyncSource({ fetchWeek })();

    expect(detail.wroteData).toBe(true);
  });

  it("does not report wroteData when nothing changed anywhere", async () => {
    const detail = await createDefaultSyncSource({ fetchWeek })();

    expect(detail.wroteData).toBe(false);
  });

  it("still runs the housekeeping when Yahoo fails, then surfaces the failure", async () => {
    const yahooDown = new Error("Yahoo league stats request failed with status 503");
    state.yahoo.mockRejectedValue(yahooDown);

    await expect(createDefaultSyncSource({ fetchWeek })()).rejects.toBe(yahooDown);
    expect(state.calls).toEqual(["seedLock", "matchups"]);
  });

  it("passes the injected fetcher through to the Yahoo step", async () => {
    await createDefaultSyncSource({ fetchWeek })();

    expect(state.yahoo).toHaveBeenCalledWith(
      expect.objectContaining({ fetchWeek }),
    );
  });
});
