import { describe, expect, it } from "vitest";

import { createLoginThrottle } from "./throttle";

describe("login throttle", () => {
  it("blocks after the configured number of failures", () => {
    let currentTime = 0;
    const throttle = createLoginThrottle({
      limit: 3,
      windowMs: 60_000,
      now: () => currentTime,
    });

    expect(throttle.canAttempt("127.0.0.1")).toBe(true);

    throttle.recordFailure("127.0.0.1");
    throttle.recordFailure("127.0.0.1");

    expect(throttle.canAttempt("127.0.0.1")).toBe(true);

    throttle.recordFailure("127.0.0.1");

    expect(throttle.canAttempt("127.0.0.1")).toBe(false);

    currentTime = 60_000;

    expect(throttle.canAttempt("127.0.0.1")).toBe(true);
  });

  it("resets failures after a successful login", () => {
    const throttle = createLoginThrottle({
      limit: 2,
      windowMs: 60_000,
      now: () => 0,
    });

    throttle.recordFailure("127.0.0.1");
    throttle.reset("127.0.0.1");

    expect(throttle.canAttempt("127.0.0.1")).toBe(true);
  });
});
