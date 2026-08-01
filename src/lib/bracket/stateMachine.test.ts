import { describe, expect, it } from "vitest";

import {
  transitionMatchupState,
  transitionSeedLockState,
} from "./stateMachine";

const sundayNight = new Date("2026-09-14T04:00:00.000Z");
const beforeWindowCloses = new Date("2026-09-15T03:59:59.000Z");
const afterWindowCloses = new Date("2026-09-15T04:00:00.000Z");

describe("transitionMatchupState", () => {
  it("creates a provisional matchup result and describes provisional advancement", () => {
    const result = transitionMatchupState(
      { status: "live" },
      {
        type: "record_provisional_result",
        resultFingerprint: "a:6-b:4",
        winnerTeamId: "team-a",
        downstreamMatchupId: "sf-1",
      },
      sundayNight,
    );

    expect(result.nextState).toMatchObject({
      status: "provisional",
      resultFingerprint: "a:6-b:4",
      computedWinnerTeamId: "team-a",
      lockedAt: sundayNight,
    });
    expect(result.sideEffects).toEqual([
      {
        type: "advance_winner",
        entity: "matchup",
        winnerTeamId: "team-a",
        downstreamMatchupId: "sf-1",
      },
    ]);
  });

  it("does not settle before the 24-hour correction window has elapsed", () => {
    const result = transitionMatchupState(
      {
        status: "provisional",
        resultFingerprint: "a:6-b:4",
        computedWinnerTeamId: "team-a",
        lockedAt: sundayNight,
      },
      {
        type: "settle_check",
        resultFingerprint: "a:6-b:4",
        winnerTeamId: "team-a",
      },
      beforeWindowCloses,
    );

    expect(result.nextState.status).toBe("provisional");
    expect(result.sideEffects).toEqual([]);
  });

  it("updates provisional tallies before the window closes when the winner holds", () => {
    const result = transitionMatchupState(
      {
        status: "provisional",
        resultFingerprint: "a:6-b:4",
        computedWinnerTeamId: "team-a",
        lockedAt: sundayNight,
      },
      {
        type: "settle_check",
        resultFingerprint: "a:5-b:4-t:1",
        winnerTeamId: "team-a",
      },
      beforeWindowCloses,
    );

    expect(result.nextState).toMatchObject({
      status: "provisional",
      resultFingerprint: "a:5-b:4-t:1",
      computedWinnerTeamId: "team-a",
    });
    expect(result.sideEffects).toEqual([
      { type: "update_result", entity: "matchup" },
    ]);
  });

  it("freezes a branch immediately when the corrected winner flips inside the window", () => {
    const result = transitionMatchupState(
      {
        status: "provisional",
        resultFingerprint: "a:6-b:4",
        computedWinnerTeamId: "team-a",
        lockedAt: sundayNight,
      },
      {
        type: "settle_check",
        resultFingerprint: "a:4-b:6",
        winnerTeamId: "team-b",
        downstreamMatchupId: "sf-1",
      },
      beforeWindowCloses,
    );

    expect(result.nextState.status).toBe("under_review");
    expect(result.sideEffects).toEqual([
      {
        type: "pause_downstream_branch",
        entity: "matchup",
        downstreamMatchupId: "sf-1",
      },
      { type: "show_public_review_banner", entity: "matchup" },
    ]);
  });

  it("settles an unchanged provisional matchup after the correction window", () => {
    const result = transitionMatchupState(
      {
        status: "provisional",
        resultFingerprint: "a:6-b:4",
        computedWinnerTeamId: "team-a",
        lockedAt: sundayNight,
      },
      {
        type: "settle_check",
        resultFingerprint: "a:6-b:4",
        winnerTeamId: "team-a",
      },
      afterWindowCloses,
    );

    expect(result.nextState).toMatchObject({
      status: "final",
      settledAt: afterWindowCloses,
      computedWinnerTeamId: "team-a",
    });
    expect(result.sideEffects).toEqual([
      { type: "settle_result", entity: "matchup" },
    ]);
  });

  it("updates tallies and settles when stats changed but the winner held", () => {
    const result = transitionMatchupState(
      {
        status: "provisional",
        resultFingerprint: "a:6-b:4",
        computedWinnerTeamId: "team-a",
        lockedAt: sundayNight,
      },
      {
        type: "settle_check",
        resultFingerprint: "a:5-b:4-t:1",
        winnerTeamId: "team-a",
      },
      afterWindowCloses,
    );

    expect(result.nextState).toMatchObject({
      status: "final",
      resultFingerprint: "a:5-b:4-t:1",
      settledAt: afterWindowCloses,
    });
    expect(result.sideEffects).toEqual([
      { type: "update_result", entity: "matchup" },
      { type: "settle_result", entity: "matchup" },
    ]);
  });

  it("freezes a branch under review when a corrected winner flips", () => {
    const result = transitionMatchupState(
      {
        status: "provisional",
        resultFingerprint: "a:6-b:4",
        computedWinnerTeamId: "team-a",
        lockedAt: sundayNight,
      },
      {
        type: "settle_check",
        resultFingerprint: "a:4-b:6",
        winnerTeamId: "team-b",
        downstreamMatchupId: "sf-1",
      },
      afterWindowCloses,
    );

    expect(result.nextState).toMatchObject({
      status: "under_review",
      computedWinnerTeamId: "team-a",
      review: {
        originalWinnerTeamId: "team-a",
        correctedWinnerTeamId: "team-b",
        originalResultFingerprint: "a:6-b:4",
        correctedResultFingerprint: "a:4-b:6",
        detectedAt: afterWindowCloses,
      },
    });
    expect(result.sideEffects).toEqual([
      {
        type: "pause_downstream_branch",
        entity: "matchup",
        downstreamMatchupId: "sf-1",
      },
      { type: "show_public_review_banner", entity: "matchup" },
    ]);
  });

  it("lets admin confirm the original under-review matchup result", () => {
    const result = transitionMatchupState(
      {
        status: "under_review",
        resultFingerprint: "a:6-b:4",
        computedWinnerTeamId: "team-a",
        lockedAt: sundayNight,
        review: {
          originalWinnerTeamId: "team-a",
          correctedWinnerTeamId: "team-b",
          originalResultFingerprint: "a:6-b:4",
          correctedResultFingerprint: "a:4-b:6",
          detectedAt: afterWindowCloses,
        },
      },
      { type: "admin_confirm_original", downstreamMatchupId: "sf-1" },
      afterWindowCloses,
    );

    expect(result.nextState).toMatchObject({
      status: "final",
      computedWinnerTeamId: "team-a",
      overrideWinnerTeamId: undefined,
      settledAt: afterWindowCloses,
      review: null,
    });
    expect(result.sideEffects).toEqual([
      {
        type: "resume_downstream_branch",
        entity: "matchup",
        downstreamMatchupId: "sf-1",
      },
      { type: "settle_result", entity: "matchup" },
    ]);
  });

  it("lets admin override to the corrected under-review matchup winner", () => {
    const result = transitionMatchupState(
      {
        status: "under_review",
        resultFingerprint: "a:6-b:4",
        computedWinnerTeamId: "team-a",
        lockedAt: sundayNight,
        review: {
          originalWinnerTeamId: "team-a",
          correctedWinnerTeamId: "team-b",
          originalResultFingerprint: "a:6-b:4",
          correctedResultFingerprint: "a:4-b:6",
          detectedAt: afterWindowCloses,
        },
      },
      { type: "admin_override_corrected", downstreamMatchupId: "sf-1" },
      afterWindowCloses,
    );

    expect(result.nextState).toMatchObject({
      status: "final",
      computedWinnerTeamId: "team-a",
      overrideWinnerTeamId: "team-b",
      settledAt: afterWindowCloses,
      review: null,
    });
    expect(result.sideEffects).toEqual([
      {
        type: "resume_downstream_branch",
        entity: "matchup",
        downstreamMatchupId: "sf-1",
      },
      { type: "settle_result", entity: "matchup" },
    ]);
  });
});

describe("transitionSeedLockState", () => {
  it("creates a provisional seed lock and describes R1 pairing creation", () => {
    const result = transitionSeedLockState(
      { status: "none" },
      {
        type: "record_provisional_seed_lock",
        seedFingerprint: "9,10,11,12,13,14,15,16",
      },
      sundayNight,
    );

    expect(result.nextState).toMatchObject({
      status: "provisional",
      seedFingerprint: "9,10,11,12,13,14,15,16",
      seedsLockedAt: sundayNight,
    });
    expect(result.sideEffects).toEqual([
      { type: "lock_round_one_pairings", entity: "seed_lock" },
    ]);
  });

  it("settles unchanged seeds after the correction window", () => {
    const result = transitionSeedLockState(
      {
        status: "provisional",
        seedFingerprint: "9,10,11,12,13,14,15,16",
        seedsLockedAt: sundayNight,
      },
      {
        type: "settle_check",
        seedFingerprint: "9,10,11,12,13,14,15,16",
      },
      afterWindowCloses,
    );

    expect(result.nextState).toMatchObject({
      status: "settled",
      seedsSettledAt: afterWindowCloses,
    });
    expect(result.sideEffects).toEqual([
      { type: "settle_result", entity: "seed_lock" },
    ]);
  });

  it("freezes seed lock when the 9-16 field or order changes", () => {
    const result = transitionSeedLockState(
      {
        status: "provisional",
        seedFingerprint: "9,10,11,12,13,14,15,16",
        seedsLockedAt: sundayNight,
      },
      {
        type: "settle_check",
        seedFingerprint: "9,10,11,12,13,16,15,14",
      },
      afterWindowCloses,
    );

    expect(result.nextState).toMatchObject({
      status: "under_review",
      seedFingerprint: "9,10,11,12,13,14,15,16",
      review: {
        originalSeedFingerprint: "9,10,11,12,13,14,15,16",
        correctedSeedFingerprint: "9,10,11,12,13,16,15,14",
        detectedAt: afterWindowCloses,
      },
    });
    expect(result.sideEffects).toEqual([
      { type: "freeze_round_one_pairings", entity: "seed_lock" },
      { type: "show_public_review_banner", entity: "seed_lock" },
    ]);
  });

  it("freezes seed lock immediately when the 9-16 field changes inside the window", () => {
    const result = transitionSeedLockState(
      {
        status: "provisional",
        seedFingerprint: "9,10,11,12,13,14,15,16",
        seedsLockedAt: sundayNight,
      },
      {
        type: "settle_check",
        seedFingerprint: "9,10,11,12,13,16,15,14",
      },
      beforeWindowCloses,
    );

    expect(result.nextState.status).toBe("under_review");
    expect(result.sideEffects).toEqual([
      { type: "freeze_round_one_pairings", entity: "seed_lock" },
      { type: "show_public_review_banner", entity: "seed_lock" },
    ]);
  });

  it("lets admin confirm original seeds", () => {
    const result = transitionSeedLockState(
      {
        status: "under_review",
        seedFingerprint: "9,10,11,12,13,14,15,16",
        seedsLockedAt: sundayNight,
        review: {
          originalSeedFingerprint: "9,10,11,12,13,14,15,16",
          correctedSeedFingerprint: "9,10,11,12,13,16,15,14",
          detectedAt: afterWindowCloses,
        },
      },
      { type: "admin_confirm_original" },
      afterWindowCloses,
    );

    expect(result.nextState).toMatchObject({
      status: "settled",
      seedFingerprint: "9,10,11,12,13,14,15,16",
      seedsSettledAt: afterWindowCloses,
      review: null,
    });
    expect(result.sideEffects).toEqual([
      { type: "settle_result", entity: "seed_lock" },
    ]);
  });

  it("lets admin re-lock corrected seeds", () => {
    const result = transitionSeedLockState(
      {
        status: "under_review",
        seedFingerprint: "9,10,11,12,13,14,15,16",
        seedsLockedAt: sundayNight,
        review: {
          originalSeedFingerprint: "9,10,11,12,13,14,15,16",
          correctedSeedFingerprint: "9,10,11,12,13,16,15,14",
          detectedAt: afterWindowCloses,
        },
      },
      { type: "admin_relock_corrected" },
      afterWindowCloses,
    );

    expect(result.nextState).toMatchObject({
      status: "settled",
      seedFingerprint: "9,10,11,12,13,16,15,14",
      seedsSettledAt: afterWindowCloses,
      review: null,
    });
    expect(result.sideEffects).toEqual([
      { type: "replace_round_one_pairings", entity: "seed_lock" },
      { type: "settle_result", entity: "seed_lock" },
    ]);
  });
});
