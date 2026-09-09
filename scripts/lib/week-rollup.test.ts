import { describe, expect, it } from "vitest";

import {
  formatInnings,
  parseInnings,
  rollUpWeek,
  type DayStatRow,
} from "./week-rollup";

const baseRow: DayStatRow = {
  team_id: "baseball-furries",
  date: "2026-09-07",
  week: "24",
  r: "0",
  "2b": "0",
  "3b": "0",
  hr: "0",
  rbi: "0",
  sb: "0",
  ops: ".000",
  w: "0",
  bb: "0",
  k: "0",
  era: "-",
  whip: "-",
  k9: "-",
  nsvh: "0",
  at_bats: "0",
  batting_hits: "0",
  innings_pitched: "0.0",
};

function row(overrides: Partial<DayStatRow>): DayStatRow {
  return { ...baseRow, ...overrides };
}

describe("innings thirds notation", () => {
  it("rolls three outs into a whole inning", () => {
    expect(formatInnings(parseInnings("1.2") + parseInnings("0.1"))).toBe("2.0");
    expect(formatInnings(parseInnings("8.1") + parseInnings("8.1"))).toBe("16.2");
  });
});

describe("rollUpWeek", () => {
  it("keeps earlier ERA and WHIP when the latest day has zero IP", () => {
    const [rolled] = rollUpWeek([
      [
        row({
          k: "3",
          era: "2.08",
          whip: "1.38",
          k9: "6.23",
          innings_pitched: "4.1",
        }),
      ],
      [
        row({
          date: "2026-09-08",
          era: "-",
          whip: "-",
          k9: "-",
          innings_pitched: "0.0",
        }),
      ],
    ]);

    expect(rolled.era).toBe("2.08");
    expect(rolled.whip).toBe("1.38");
    expect(rolled.k9).toBe("6.23");
    expect(rolled.innings_pitched).toBe("4.1");
  });

  it("weights ERA and WHIP by innings when day sizes are very different", () => {
    const [rolled] = rollUpWeek([
      [
        row({
          era: "32.40",
          whip: "5.00",
          k9: "0.00",
          innings_pitched: "1.0",
        }),
      ],
      [
        row({
          date: "2026-09-08",
          era: "0.69",
          whip: "1.00",
          k9: "0.00",
          innings_pitched: "13.0",
        }),
      ],
    ]);

    expect(rolled.era).toBe("2.96");
    expect(rolled.whip).toBe("1.29");
    expect(rolled.innings_pitched).toBe("14.0");
  });

  it("computes K/9 from cumulative strikeouts and innings", () => {
    const [rolled] = rollUpWeek([
      [
        row({
          k: "1",
          era: "0.00",
          whip: "0.00",
          k9: "99.99",
          innings_pitched: "1.0",
        }),
      ],
      [
        row({
          date: "2026-09-08",
          k: "0",
          era: "0.00",
          whip: "0.00",
          k9: "99.99",
          innings_pitched: "2.0",
        }),
      ],
    ]);

    expect(rolled.k9).toBe("3.00");
  });

  it("weights OPS across every day with at-bats", () => {
    const [rolled] = rollUpWeek([
      [row({ ops: ".300", at_bats: "10" })],
      [row({ date: "2026-09-08", ops: ".900", at_bats: "30" })],
      [row({ date: "2026-09-09", ops: ".100", at_bats: "10" })],
    ]);

    expect(rolled.ops).toBe(".620");
    expect(rolled.at_bats).toBe("50");
  });

  it("emits Yahoo placeholders for all pitching ratios when total IP is zero", () => {
    const [rolled] = rollUpWeek([
      [row({ at_bats: "4", batting_hits: "1" })],
      [
        row({
          date: "2026-09-08",
          at_bats: "3",
          batting_hits: "1",
        }),
      ],
    ]);

    expect(rolled.era).toBe("-");
    expect(rolled.whip).toBe("-");
    expect(rolled.k9).toBe("-");
    expect(rolled.innings_pitched).toBe("0.0");
  });

  it("sums negative NSVH values", () => {
    const [rolled] = rollUpWeek([
      [row({ nsvh: "-2" })],
      [row({ date: "2026-09-08", nsvh: "1" })],
    ]);

    expect(rolled.nsvh).toBe("-1");
  });
});
