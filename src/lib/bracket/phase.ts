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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function dateKeyInTimeZone(date: Date, timeZone: string): string {
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

function dateKeyToUtcMs(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);

  return Date.UTC(year, month - 1, day);
}

function daysBetweenDateKeys(startDateKey: string, endDateKey: string): number {
  return Math.round(
    (dateKeyToUtcMs(endDateKey) - dateKeyToUtcMs(startDateKey)) / MS_PER_DAY,
  );
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

export function formatLockCountdown(now: Date, config: PhaseConfig): string {
  const today = dateKeyInTimeZone(now, config.timeZone);
  const daysUntilLock = daysBetweenDateKeys(today, config.bracketLockDate);

  if (daysUntilLock > 1) {
    return `${daysUntilLock} days until lock`;
  }

  if (daysUntilLock === 1) {
    return "Locks tomorrow";
  }

  if (daysUntilLock === 0) {
    return "Locks today";
  }

  return "Lock passed";
}
