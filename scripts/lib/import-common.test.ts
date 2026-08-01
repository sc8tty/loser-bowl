import { describe, expect, it } from "vitest";

import {
  assertCompleteRanks,
  normalizeMatchupPair,
  parseCliArgs,
  parseCsv,
} from "./import-common";

describe("parseCsv", () => {
  it("parses a simple header + rows", () => {
    expect(parseCsv("a,b\n1,2\n3,4\n")).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    expect(parseCsv('name,note\n"Bats, The","said ""hi"""\n')).toEqual([
      { name: "Bats, The", note: 'said "hi"' },
    ]);
  });

  it("handles CRLF line endings and trailing whitespace-only lines", () => {
    expect(parseCsv("a,b\r\n1,2\r\n\r\n")).toEqual([{ a: "1", b: "2" }]);
  });

  it("rejects a row with the wrong field count", () => {
    expect(() => parseCsv("a,b\n1,2,3\n")).toThrow(/row 2/i);
  });

  it("rejects an unterminated quote", () => {
    expect(() => parseCsv('a,b\n"open,2\n')).toThrow(/unterminated/i);
  });

  it("rejects a header-only file", () => {
    expect(() => parseCsv("a,b\n")).toThrow(/at least one data row/i);
  });
});

describe("normalizeMatchupPair", () => {
  it("keeps an already-ordered pair and its winner", () => {
    expect(normalizeMatchupPair("alpha", "zulu", "a")).toEqual({
      teamAId: "alpha",
      teamBId: "zulu",
      winner: "a",
    });
  });

  it("swaps a reversed pair and flips the winner", () => {
    expect(normalizeMatchupPair("zulu", "alpha", "a")).toEqual({
      teamAId: "alpha",
      teamBId: "zulu",
      winner: "b",
    });
    expect(normalizeMatchupPair("zulu", "alpha", "b")).toEqual({
      teamAId: "alpha",
      teamBId: "zulu",
      winner: "a",
    });
  });

  it("preserves ties through a swap", () => {
    expect(normalizeMatchupPair("zulu", "alpha", "tie").winner).toBe("tie");
  });

  it("rejects a team paired with itself", () => {
    expect(() => normalizeMatchupPair("same", "same", "tie")).toThrow(
      /distinct/i,
    );
  });
});

describe("assertCompleteRanks", () => {
  const complete = Array.from({ length: 16 }, (_, index) => ({
    teamId: `team-${index + 1}`,
    rank: index + 1,
  }));

  it("accepts a complete 1-16 field", () => {
    expect(() => assertCompleteRanks(complete)).not.toThrow();
  });

  it("rejects a short field", () => {
    expect(() => assertCompleteRanks(complete.slice(0, 15))).toThrow(/16/);
  });

  it("rejects duplicate ranks", () => {
    const duped = [...complete.slice(0, 15), { teamId: "dupe", rank: 1 }];
    expect(() => assertCompleteRanks(duped)).toThrow(/every rank/i);
  });
});

describe("parseCliArgs", () => {
  it("extracts path and dry-run flag", () => {
    expect(parseCliArgs(["--dry-run", "file.csv"], "usage")).toEqual({
      filePath: "file.csv",
      dryRun: true,
    });
  });

  it("requires exactly one path", () => {
    expect(() => parseCliArgs(["a.csv", "b.csv"], "usage")).toThrow(/exactly one/i);
    expect(() => parseCliArgs(["--dry-run"], "usage")).toThrow(/exactly one/i);
  });
});
