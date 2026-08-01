import { describe, expect, it } from "vitest";

import {
  formatCompositeFraction,
  formatInningsPitched,
  formatRatio,
  parseCompositeFraction,
  parseInningsPitched,
  parseRatio,
} from "./parsers";

describe("parseInningsPitched", () => {
  it("parses Yahoo IP decimals as outs, not tenths", () => {
    expect(parseInningsPitched("52.1")).toMatchObject({
      wholeInnings: 52,
      outs: 1,
      value: 52 + 1 / 3,
    });
    expect(parseInningsPitched("52.2")).toMatchObject({
      wholeInnings: 52,
      outs: 2,
      value: 52 + 2 / 3,
    });
  });

  it("round-trips canonical Yahoo innings strings", () => {
    for (const input of ["0", "0.0", "1.1", "13.2", "52.1", "100.0"]) {
      expect(formatInningsPitched(parseInningsPitched(input))).toBe(input);
    }
  });

  it("rejects impossible out decimals", () => {
    expect(() => parseInningsPitched("12.3")).toThrow(/innings pitched/i);
    expect(() => parseInningsPitched("12.10")).toThrow(/innings pitched/i);
  });
});

describe("parseRatio", () => {
  it("parses Yahoo decimal ratio strings", () => {
    expect(parseRatio("3.21")).toMatchObject({
      value: 3.21,
      decimalPlaces: 2,
    });
    expect(parseRatio(".286")).toMatchObject({
      value: 0.286,
      decimalPlaces: 3,
    });
  });

  it("round-trips canonical Yahoo ratio strings", () => {
    for (const input of ["0", "0.00", ".286", "1.250", "3.21", "12"]) {
      expect(formatRatio(parseRatio(input))).toBe(input);
    }
  });

  it("rejects non-numeric ratio values", () => {
    expect(() => parseRatio("-")).toThrow(/ratio/i);
    expect(() => parseRatio("3/10")).toThrow(/ratio/i);
  });
});

describe("parseCompositeFraction", () => {
  it("parses Yahoo composite fraction strings", () => {
    expect(parseCompositeFraction("45/167")).toEqual({
      numerator: 45,
      denominator: 167,
      value: 45 / 167,
    });
  });

  it("keeps zero-denominator fractions parseable without inventing a value", () => {
    expect(parseCompositeFraction("0/0")).toEqual({
      numerator: 0,
      denominator: 0,
      value: null,
    });
  });

  it("round-trips canonical Yahoo composite fractions", () => {
    for (const input of ["0/0", "1/3", "45/167", "100/400"]) {
      expect(formatCompositeFraction(parseCompositeFraction(input))).toBe(input);
    }
  });
});
