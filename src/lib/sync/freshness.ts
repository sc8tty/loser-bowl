import type { BracketPhase } from "@/lib/bracket/phase";

export const FRESHNESS_WINDOW_MS: Record<BracketPhase, number> = {
  bracket: 30 * 60 * 1000,
  race: 6 * 60 * 60 * 1000,
  champion: Number.POSITIVE_INFINITY,
};

export function freshnessWindow(phase: BracketPhase): number {
  return FRESHNESS_WINDOW_MS[phase];
}

export function isStale(
  lastSuccessAt: Date | null,
  phase: BracketPhase,
  now: Date,
): boolean {
  const window = freshnessWindow(phase);

  if (window === Number.POSITIVE_INFINITY) {
    return false;
  }

  if (lastSuccessAt === null) {
    return true;
  }

  return now.getTime() - lastSuccessAt.getTime() >= window;
}

export const BACKOFF_BASE_MS = 5 * 60 * 1000;
export const BACKOFF_CAP_MS = 6 * 60 * 60 * 1000;

/** Exponential backoff: 5 min, 10, 20, ... capped at 6 h. */
export function backoffMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) {
    return 0;
  }

  const exponent = Math.min(consecutiveFailures - 1, 31);

  return Math.min(BACKOFF_BASE_MS * 2 ** exponent, BACKOFF_CAP_MS);
}
