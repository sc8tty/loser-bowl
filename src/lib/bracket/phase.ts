export type BracketPhase = "race" | "bracket" | "champion";

export type PhaseConfig = {
  timeZone: string;
  bracketLockDate: string;
};

export type FinalMatchupForPhase = {
  status: string;
  computedWinnerTeamId?: string | null;
  overrideWinnerTeamId?: string | null;
};

function dateKeyInTimeZone(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Unable to evaluate date in time zone ${timeZone}`);
  }

  return `${year}-${month}-${day}`;
}

function effectiveWinner(finalMatchup: FinalMatchupForPhase | null): string | null {
  if (finalMatchup === null) {
    return null;
  }

  return (
    finalMatchup.overrideWinnerTeamId ??
    finalMatchup.computedWinnerTeamId ??
    null
  );
}

export function phase(
  now: Date,
  config: PhaseConfig,
  finalMatchup: FinalMatchupForPhase | null,
): BracketPhase {
  if (finalMatchup?.status === "final" && effectiveWinner(finalMatchup) !== null) {
    return "champion";
  }

  return dateKeyInTimeZone(now, config.timeZone) <= config.bracketLockDate
    ? "race"
    : "bracket";
}
