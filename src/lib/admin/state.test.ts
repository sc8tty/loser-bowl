import { describe, expect, it } from "vitest";

import {
  canRenderMatchupSettleControl,
  canRenderSeedLockSettleControl,
  jsonFingerprint,
} from "./state";

describe("admin state helpers", () => {
  it("creates stable fingerprints for object values", () => {
    expect(jsonFingerprint({ b: 2, a: { d: 4, c: 3 } })).toBe(
      jsonFingerprint({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });

  it("shows matchup controls only for reviewable states", () => {
    expect(canRenderMatchupSettleControl("provisional")).toBe(true);
    expect(canRenderMatchupSettleControl("under_review")).toBe(true);
    expect(canRenderMatchupSettleControl("final")).toBe(false);
  });

  it("shows seed lock controls only for reviewable states", () => {
    expect(canRenderSeedLockSettleControl("provisional")).toBe(true);
    expect(canRenderSeedLockSettleControl("under_review")).toBe(true);
    expect(canRenderSeedLockSettleControl("settled")).toBe(false);
  });
});
