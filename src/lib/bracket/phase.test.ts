import { describe, expect, it } from "vitest";

import { LEAGUE_CONFIG } from "@/config/league";

import { formatLockCountdown, phase } from "./phase";

describe("phase", () => {
  it("stays in race phase through the configured lock date in league time", () => {
    expect(
      phase(new Date("2026-09-07T06:59:59.000Z"), LEAGUE_CONFIG, null),
    ).toBe("race");
  });

  it("switches to bracket after the lock date in league time", () => {
    expect(
      phase(new Date("2026-09-07T07:00:00.000Z"), LEAGUE_CONFIG, null),
    ).toBe("bracket");
  });

  it("does not enter champion phase for a provisional final winner", () => {
    expect(
      phase(new Date("2026-09-28T07:00:00.000Z"), LEAGUE_CONFIG, {
        status: "provisional",
        computedWinnerTeamId: "team-a",
        overrideWinnerTeamId: null,
      }),
    ).toBe("bracket");
  });

  it("does not enter champion phase for a final matchup without an effective winner", () => {
    expect(
      phase(new Date("2026-09-28T07:00:00.000Z"), LEAGUE_CONFIG, {
        status: "final",
        computedWinnerTeamId: null,
        overrideWinnerTeamId: null,
      }),
    ).toBe("bracket");
  });

  it("enters champion phase only after the final is final with an effective winner", () => {
    expect(
      phase(new Date("2026-09-28T07:00:00.000Z"), LEAGUE_CONFIG, {
        status: "final",
        computedWinnerTeamId: "team-a",
        overrideWinnerTeamId: null,
      }),
    ).toBe("champion");
    expect(
      phase(new Date("2026-09-28T07:00:00.000Z"), LEAGUE_CONFIG, {
        status: "final",
        computedWinnerTeamId: "team-a",
        overrideWinnerTeamId: "team-b",
      }),
    ).toBe("champion");
  });
});

describe("formatLockCountdown", () => {
  it("shows days remaining when the lock is several days out", () => {
    expect(
      formatLockCountdown(new Date("2026-08-31T07:00:00.000Z"), LEAGUE_CONFIG),
    ).toBe("6 days until lock");
  });

  it("shows tomorrow on the league-time day before lock", () => {
    expect(
      formatLockCountdown(new Date("2026-09-06T06:59:59.000Z"), LEAGUE_CONFIG),
    ).toBe("Locks tomorrow");
  });

  it("shows today on the lock date in league time", () => {
    expect(
      formatLockCountdown(new Date("2026-09-06T07:00:00.000Z"), LEAGUE_CONFIG),
    ).toBe("Locks today");
  });

  it("shows a past-lock state after the lock date in league time", () => {
    expect(
      formatLockCountdown(new Date("2026-09-07T07:00:00.000Z"), LEAGUE_CONFIG),
    ).toBe("Lock passed");
  });
});
