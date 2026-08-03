export type LoginThrottle = ReturnType<typeof createLoginThrottle>;

type AttemptWindow = {
  count: number;
  firstAttemptAt: number;
};

export function createLoginThrottle({
  limit,
  windowMs,
  now = () => Date.now(),
}: {
  limit: number;
  windowMs: number;
  now?: () => number;
}) {
  const attempts = new Map<string, AttemptWindow>();

  function currentWindow(key: string): AttemptWindow | null {
    const entry = attempts.get(key);

    if (entry === undefined) {
      return null;
    }

    if (now() - entry.firstAttemptAt >= windowMs) {
      attempts.delete(key);
      return null;
    }

    return entry;
  }

  return {
    canAttempt(key: string): boolean {
      return (currentWindow(key)?.count ?? 0) < limit;
    },
    recordFailure(key: string): { blocked: boolean; retryAfterMs: number } {
      const entry = currentWindow(key) ?? {
        count: 0,
        firstAttemptAt: now(),
      };

      entry.count += 1;
      attempts.set(key, entry);

      return {
        blocked: entry.count >= limit,
        retryAfterMs: Math.max(0, entry.firstAttemptAt + windowMs - now()),
      };
    },
    reset(key: string): void {
      attempts.delete(key);
    },
  };
}

export function clientIpFromHeaders(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}
