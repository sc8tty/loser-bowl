import { describe, expect, it } from "vitest";

import { SEEDED_LEAGUE_SETTINGS } from "./categories.seed";
import { LEAGUE_CONFIG } from "./league";

const toDate = (date: string) => new Date(`${date}T00:00:00-07:00`);

describe("LEAGUE_CONFIG", () => {
  it("uses the 2026 season and configured league timezone", () => {
    expect(LEAGUE_CONFIG.season).toBe(2026);
    expect(LEAGUE_CONFIG.timeZone).toBe("America/Los_Angeles");
  });

  it("keeps all bowl round dates inside the configured season", () => {
    for (const round of LEAGUE_CONFIG.rounds) {
      expect(toDate(round.start).getFullYear()).toBe(LEAGUE_CONFIG.season);
      expect(toDate(round.end).getFullYear()).toBe(LEAGUE_CONFIG.season);
      expect(toDate(round.start).getTime()).toBeLessThanOrEqual(
        toDate(round.end).getTime(),
      );
    }
  });

  it("locks the bracket before round one begins", () => {
    const lockDate = toDate(LEAGUE_CONFIG.bracketLockDate);
    const roundOneStart = toDate(LEAGUE_CONFIG.rounds[0].start);

    expect(lockDate.getTime()).toBeLessThan(roundOneStart.getTime());
  });

  it("defines seeds 9 through 16 as the loser-bowl field", () => {
    expect(LEAGUE_CONFIG.bowlSeeds).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it("pins the exact PRD calendar", () => {
    expect(LEAGUE_CONFIG.bracketLockDate).toBe("2026-09-06");
    expect(LEAGUE_CONFIG.rounds.map((round) => round.week)).toEqual([
      23, 24, 25,
    ]);
    expect(
      LEAGUE_CONFIG.rounds.map((round) => [round.start, round.end]),
    ).toEqual([
      ["2026-09-07", "2026-09-13"],
      ["2026-09-14", "2026-09-20"],
      ["2026-09-21", "2026-09-27"],
    ]);
  });

  it("keeps seeded league settings aligned with round one", () => {
    expect(SEEDED_LEAGUE_SETTINGS.playoffStartWeek).toBe(
      LEAGUE_CONFIG.rounds[0].week,
    );
  });
});
