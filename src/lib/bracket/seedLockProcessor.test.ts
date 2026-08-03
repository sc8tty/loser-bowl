import { describe, expect, it } from "vitest";

import { LEAGUE_CONFIG } from "@/config/league";

import {
  buildSeedSnapshot,
  decideSeedLock,
  seedSnapshotFingerprint,
  type SeedLockStanding,
} from "./seedLockProcessor";

const beforeBoundary = new Date("2026-09-07T06:59:59.000Z");
const atBoundary = new Date("2026-09-07T07:00:00.000Z");
const afterWindow = new Date("2026-09-08T07:00:00.000Z");

function standings(
  overrides: Partial<Record<number, string>> = {},
): SeedLockStanding[] {
  return Array.from({ length: 16 }, (_, index) => {
    const rank = index + 1;

    return {
      id: overrides[rank] ?? `team-${rank}`,
      currentRank: rank,
    };
  });
}

describe("buildSeedSnapshot", () => {
  it("captures exactly the configured bowl seed field", () => {
    expect(buildSeedSnapshot(standings())).toEqual({
      teams: [
        { id: "team-9", seed: 9 },
        { id: "team-10", seed: 10 },
        { id: "team-11", seed: 11 },
        { id: "team-12", seed: 12 },
        { id: "team-13", seed: 13 },
        { id: "team-14", seed: 14 },
        { id: "team-15", seed: 15 },
        { id: "team-16", seed: 16 },
      ],
    });
  });

  it("refuses to build an ambiguous seed snapshot", () => {
    expect(
      buildSeedSnapshot([
        ...standings().filter((team) => team.currentRank !== 16),
        { id: "team-9-b", currentRank: 9 },
      ]),
    ).toBeNull();
  });
});

describe("decideSeedLock", () => {
  it("does nothing before the same league-time boundary used by phase()", () => {
    const decision = decideSeedLock({
      standings: standings(),
      syncState: {
        seedLockStatus: "none",
        seedsLockedAt: null,
        seedsSettledAt: null,
        seedsSnapshot: null,
      },
      now: beforeBoundary,
    });

    expect(decision).toMatchObject({
      action: "none",
      reason: "before_lock_boundary",
      wroteData: false,
    });
  });

  it("locks provisional seeds and creates the fixed 7-row bracket skeleton", () => {
    const decision = decideSeedLock({
      standings: standings(),
      syncState: {
        seedLockStatus: "none",
        seedsLockedAt: null,
        seedsSettledAt: null,
        seedsSnapshot: null,
      },
      now: atBoundary,
    });

    expect(decision.action).toBe("lock_provisional");

    if (decision.action !== "lock_provisional") {
      throw new Error("Expected provisional lock decision");
    }

    expect(decision.syncState).toMatchObject({
      seedLockStatus: "provisional",
      seedsLockedAt: atBoundary,
      seedsSettledAt: null,
      seedsSnapshot: {
        teams: [
          { id: "team-9", seed: 9 },
          { id: "team-10", seed: 10 },
          { id: "team-11", seed: 11 },
          { id: "team-12", seed: 12 },
          { id: "team-13", seed: 13 },
          { id: "team-14", seed: 14 },
          { id: "team-15", seed: 15 },
          { id: "team-16", seed: 16 },
        ],
      },
    });
    expect(decision.finalSeeds).toEqual([
      { teamId: "team-9", seed: 9 },
      { teamId: "team-10", seed: 10 },
      { teamId: "team-11", seed: 11 },
      { teamId: "team-12", seed: 12 },
      { teamId: "team-13", seed: 13 },
      { teamId: "team-14", seed: 14 },
      { teamId: "team-15", seed: 15 },
      { teamId: "team-16", seed: 16 },
    ]);
    expect(decision.matchups).toEqual([
      {
        id: "r1m1",
        round: 1,
        week: LEAGUE_CONFIG.rounds[0].week,
        highTeamId: "team-9",
        lowTeamId: "team-16",
        status: "pending",
      },
      {
        id: "r1m2",
        round: 1,
        week: LEAGUE_CONFIG.rounds[0].week,
        highTeamId: "team-10",
        lowTeamId: "team-15",
        status: "pending",
      },
      {
        id: "r1m3",
        round: 1,
        week: LEAGUE_CONFIG.rounds[0].week,
        highTeamId: "team-11",
        lowTeamId: "team-14",
        status: "pending",
      },
      {
        id: "r1m4",
        round: 1,
        week: LEAGUE_CONFIG.rounds[0].week,
        highTeamId: "team-12",
        lowTeamId: "team-13",
        status: "pending",
      },
      {
        id: "r2m1",
        round: 2,
        week: LEAGUE_CONFIG.rounds[1].week,
        highTeamId: null,
        lowTeamId: null,
        status: "pending",
      },
      {
        id: "r2m2",
        round: 2,
        week: LEAGUE_CONFIG.rounds[1].week,
        highTeamId: null,
        lowTeamId: null,
        status: "pending",
      },
      {
        id: "final",
        round: 3,
        week: LEAGUE_CONFIG.rounds[2].week,
        highTeamId: null,
        lowTeamId: null,
        status: "pending",
      },
    ]);
    expect(decision.sideEffects).toEqual([
      { type: "lock_round_one_pairings", entity: "seed_lock" },
    ]);
  });

  it("settles unchanged provisional seeds after the correction window", () => {
    const snapshot = buildSeedSnapshot(standings());

    if (snapshot === null) {
      throw new Error("Expected seed snapshot");
    }

    const decision = decideSeedLock({
      standings: standings(),
      syncState: {
        seedLockStatus: "provisional",
        seedsLockedAt: atBoundary,
        seedsSettledAt: null,
        seedsSnapshot: snapshot,
      },
      now: afterWindow,
    });

    expect(decision).toMatchObject({
      action: "settle",
      wroteData: true,
      fingerprint: seedSnapshotFingerprint(snapshot),
      syncState: {
        seedLockStatus: "settled",
        seedsSettledAt: afterWindow,
        seedsCorrectedSnapshot: null,
      },
      sideEffects: [{ type: "settle_result", entity: "seed_lock" }],
    });
  });

  it("keeps unchanged provisional seeds open inside the correction window", () => {
    const snapshot = buildSeedSnapshot(standings());

    if (snapshot === null) {
      throw new Error("Expected seed snapshot");
    }

    const decision = decideSeedLock({
      standings: standings(),
      syncState: {
        seedLockStatus: "provisional",
        seedsLockedAt: atBoundary,
        seedsSettledAt: null,
        seedsSnapshot: snapshot,
      },
      now: new Date("2026-09-07T18:00:00.000Z"),
    });

    expect(decision).toMatchObject({
      action: "none",
      reason: "settle_window_open",
      wroteData: false,
    });
  });

  it("flags under_review and stores the corrected snapshot when standings change", () => {
    const original = buildSeedSnapshot(standings());
    const correctedStandings = standings({
      14: "team-15",
      15: "team-14",
    });

    if (original === null) {
      throw new Error("Expected original seed snapshot");
    }

    const decision = decideSeedLock({
      standings: correctedStandings,
      syncState: {
        seedLockStatus: "provisional",
        seedsLockedAt: atBoundary,
        seedsSettledAt: null,
        seedsSnapshot: original,
      },
      now: new Date("2026-09-07T18:00:00.000Z"),
    });

    expect(decision.action).toBe("flag_review");

    if (decision.action !== "flag_review") {
      throw new Error("Expected under-review decision");
    }

    expect(decision.correctedSnapshot).toEqual({
      teams: [
        { id: "team-9", seed: 9 },
        { id: "team-10", seed: 10 },
        { id: "team-11", seed: 11 },
        { id: "team-12", seed: 12 },
        { id: "team-13", seed: 13 },
        { id: "team-15", seed: 14 },
        { id: "team-14", seed: 15 },
        { id: "team-16", seed: 16 },
      ],
    });
    expect(decision.syncState).toEqual({
      seedLockStatus: "under_review",
      seedsCorrectedSnapshot: decision.correctedSnapshot,
    });
    expect(decision.sideEffects).toEqual([
      { type: "freeze_round_one_pairings", entity: "seed_lock" },
      { type: "show_public_review_banner", entity: "seed_lock" },
    ]);
  });

  it("takes no automatic action once under review or settled", () => {
    for (const seedLockStatus of ["under_review", "settled"] as const) {
      const decision = decideSeedLock({
        standings: standings(),
        syncState: {
          seedLockStatus,
          seedsLockedAt: atBoundary,
          seedsSettledAt: seedLockStatus === "settled" ? afterWindow : null,
          seedsSnapshot: { teams: [] },
        },
        now: afterWindow,
      });

      expect(decision).toMatchObject({
        action: "none",
        wroteData: false,
      });
    }
  });
});
