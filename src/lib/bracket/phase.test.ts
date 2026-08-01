import { describe, expect, it } from "vitest";

import { LEAGUE_CONFIG } from "@/config/league";

import { phase } from "./phase";

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
