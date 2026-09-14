import { describe, expect, it } from "vitest";

import { currentRound } from "./bracket-view";

// Rounds are Week 24 (Sep 7–13), Week 25 (Sep 14–20), Week 26 (Sep 21–27), league time.
describe("currentRound", () => {
  it("is Round 1 before the bracket starts", () => {
    expect(currentRound(new Date("2026-09-01T12:00:00-07:00"))).toBe(1);
  });

  it("is Round 1 through the last day of its week", () => {
    expect(currentRound(new Date("2026-09-13T23:30:00-07:00"))).toBe(1);
  });

  it("is the Semifinals the morning after Round 1 ends, regardless of settlement", () => {
    // Round 1 is still "provisional" here — the calendar, not matchup status, decides.
    expect(currentRound(new Date("2026-09-14T09:00:00-07:00"))).toBe(2);
  });

  it("uses league time, not UTC, at the day boundary", () => {
    // 11 PM PDT Sep 13 is already Sep 14 in UTC; league time still says Round 1.
    expect(currentRound(new Date("2026-09-14T06:00:00Z"))).toBe(1);
  });

  it("is the Final during its week and after the bracket ends", () => {
    expect(currentRound(new Date("2026-09-22T12:00:00-07:00"))).toBe(3);
    expect(currentRound(new Date("2026-10-15T12:00:00-07:00"))).toBe(3);
  });
});
