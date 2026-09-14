import { describe, expect, it, vi } from "vitest";

// The pure functions under test never touch the DB, but the module imports
// @/db (server-only). Same stub pattern as tokens.test.ts.
vi.mock("@/db", () => ({ getDb: vi.fn() }));

import { bowlWeeksToSync, isNoGamesRow } from "./yahooSource";

// Bowl rounds: Week 24 (Sep 7–13), 25 (Sep 14–20), 26 (Sep 21–27), league time.
describe("bowlWeeksToSync", () => {
  it("syncs nothing before the bracket starts", () => {
    expect(bowlWeeksToSync(new Date("2026-09-01T12:00:00-07:00"))).toEqual([]);
  });

  it("syncs only Round 1's week during Round 1", () => {
    expect(bowlWeeksToSync(new Date("2026-09-10T12:00:00-07:00"))).toEqual([24]);
  });

  it("keeps a closed week in the set so late Yahoo corrections still land", () => {
    expect(bowlWeeksToSync(new Date("2026-09-14T09:00:00-07:00"))).toEqual([24, 25]);
  });

  it("syncs all three weeks once the Final has started, and after it ends", () => {
    expect(bowlWeeksToSync(new Date("2026-09-22T12:00:00-07:00"))).toEqual([24, 25, 26]);
    expect(bowlWeeksToSync(new Date("2026-10-15T12:00:00-07:00"))).toEqual([24, 25, 26]);
  });

  it("uses league time at the day boundary", () => {
    // 11 PM PDT Sep 13 is Sep 14 UTC; Week 25 must not appear yet.
    expect(bowlWeeksToSync(new Date("2026-09-14T06:00:00Z"))).toEqual([24]);
  });
});

const noGames = {
  r: "0", "2b": "0", "3b": "0", hr: "0", rbi: "0", sb: "0",
  ops: "-", w: "0", bb: "0", k: "0", era: "-", whip: "-", k9: "-", nsvh: "0",
  at_bats: "0", batting_hits: "0", innings_pitched: "0.0", avg: "-",
};

describe("isNoGamesRow", () => {
  it("recognises the row Yahoo reports before a week's first game", () => {
    expect(isNoGamesRow(noGames)).toBe(true);
  });

  it("is false once any counting stat moves", () => {
    expect(isNoGamesRow({ ...noGames, r: "1" })).toBe(false);
  });

  it("is false once any innings are pitched, even with zero counting stats", () => {
    expect(isNoGamesRow({ ...noGames, innings_pitched: "0.1" })).toBe(false);
  });

  it("is false for a negative NSVH — a blown save is a game", () => {
    expect(isNoGamesRow({ ...noGames, nsvh: "-1" })).toBe(false);
  });

  it("is false when a ratio is defined, which can only happen after play", () => {
    expect(isNoGamesRow({ ...noGames, ops: ".000" })).toBe(false);
  });
});
