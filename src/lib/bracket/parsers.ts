export type YahooStatInput = string | number;

export type ParsedInningsPitched = {
  wholeInnings: number;
  outs: 0 | 1 | 2;
  value: number;
  hasDecimal: boolean;
};

export type ParsedRatio = {
  value: number;
  decimalPlaces: number;
  omittedLeadingZero: boolean;
};

export type ParsedCompositeFraction = {
  numerator: number;
  denominator: number;
  value: number | null;
};

function statString(input: YahooStatInput): string {
  return String(input).trim();
}

export function parseInningsPitched(
  input: YahooStatInput,
): ParsedInningsPitched {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) {
      throw new Error(`Invalid innings pitched value: ${input}`);
    }

    const totalOuts = Math.round(input * 3);

    if (Math.abs(totalOuts / 3 - input) > Number.EPSILON * 100) {
      throw new Error(`Invalid innings pitched value: ${input}`);
    }

    return {
      wholeInnings: Math.floor(totalOuts / 3),
      outs: (totalOuts % 3) as 0 | 1 | 2,
      value: totalOuts / 3,
      hasDecimal: true,
    };
  }

  const raw = statString(input);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(raw);

  if (!match) {
    throw new Error(`Invalid innings pitched value: ${input}`);
  }

  const [, wholeText, outsText] = match;

  if (outsText !== undefined && !/^[012]$/.test(outsText)) {
    throw new Error(`Invalid innings pitched value: ${input}`);
  }

  const wholeInnings = Number(wholeText);
  const outs = (outsText === undefined ? 0 : Number(outsText)) as 0 | 1 | 2;

  return {
    wholeInnings,
    outs,
    value: wholeInnings + outs / 3,
    hasDecimal: outsText !== undefined,
  };
}

export function formatInningsPitched(parsed: ParsedInningsPitched): string {
  if (!parsed.hasDecimal) {
    return String(parsed.wholeInnings);
  }

  return `${parsed.wholeInnings}.${parsed.outs}`;
}

export function parseRatio(input: YahooStatInput): ParsedRatio {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new Error(`Invalid ratio value: ${input}`);
    }

    const text = String(input);
    const decimalPlaces = text.includes(".") ? text.split(".")[1].length : 0;

    return {
      value: input,
      decimalPlaces,
      omittedLeadingZero: false,
    };
  }

  const raw = statString(input);
  const match = /^(?:(\d+)(?:\.(\d+))?|\.(\d+))$/.exec(raw);

  if (!match) {
    throw new Error(`Invalid ratio value: ${input}`);
  }

  const [, wholeText, fractionalText, omittedZeroFractionalText] = match;
  const decimalText = fractionalText ?? omittedZeroFractionalText ?? "";

  return {
    value: Number(raw.startsWith(".") ? `0${raw}` : raw),
    decimalPlaces: decimalText.length,
    omittedLeadingZero: wholeText === undefined,
  };
}

export function formatRatio(parsed: ParsedRatio): string {
  const fixed = parsed.value.toFixed(parsed.decimalPlaces);

  if (parsed.omittedLeadingZero && fixed.startsWith("0.")) {
    return fixed.slice(1);
  }

  return fixed;
}

export function parseCompositeFraction(
  input: YahooStatInput,
): ParsedCompositeFraction {
  const raw = statString(input);
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec(raw);

  if (!match) {
    throw new Error(`Invalid composite fraction value: ${input}`);
  }

  const numerator = Number(match[1]);
  const denominator = Number(match[2]);

  return {
    numerator,
    denominator,
    value: denominator === 0 ? null : numerator / denominator,
  };
}

export function formatCompositeFraction(
  parsed: ParsedCompositeFraction,
): string {
  return `${parsed.numerator}/${parsed.denominator}`;
}
