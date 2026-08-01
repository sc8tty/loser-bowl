export const CORRECTION_WINDOW_MS = 24 * 60 * 60 * 1000;

export type MatchupStatus =
  | "pending"
  | "live"
  | "provisional"
  | "under_review"
  | "final";

export type SeedLockStatus =
  | "none"
  | "provisional"
  | "under_review"
  | "settled";

export type MatchupReview = {
  originalWinnerTeamId: string | null;
  correctedWinnerTeamId: string | null;
  originalResultFingerprint: string;
  correctedResultFingerprint: string;
  detectedAt: Date;
};

export type SeedLockReview = {
  originalSeedFingerprint: string;
  correctedSeedFingerprint: string;
  detectedAt: Date;
};

export type MatchupState = {
  status: MatchupStatus;
  resultFingerprint?: string;
  computedWinnerTeamId?: string | null;
  overrideWinnerTeamId?: string | null;
  lockedAt?: Date;
  settledAt?: Date;
  review?: MatchupReview | null;
};

export type SeedLockState = {
  status: SeedLockStatus;
  seedFingerprint?: string;
  seedsLockedAt?: Date;
  seedsSettledAt?: Date;
  review?: SeedLockReview | null;
};

export type StateMachineSideEffect =
  | {
      type: "advance_winner";
      entity: "matchup";
      winnerTeamId: string;
      downstreamMatchupId?: string;
    }
  | {
      type: "pause_downstream_branch";
      entity: "matchup";
      downstreamMatchupId?: string;
    }
  | {
      type: "resume_downstream_branch";
      entity: "matchup";
      downstreamMatchupId?: string;
    }
  | {
      type: "show_public_review_banner";
      entity: "matchup" | "seed_lock";
    }
  | {
      type: "update_result";
      entity: "matchup";
    }
  | {
      type: "settle_result";
      entity: "matchup" | "seed_lock";
    }
  | {
      type: "lock_round_one_pairings";
      entity: "seed_lock";
    }
  | {
      type: "freeze_round_one_pairings";
      entity: "seed_lock";
    }
  | {
      type: "replace_round_one_pairings";
      entity: "seed_lock";
    };

export type MatchupEvent =
  | {
      type: "record_provisional_result";
      resultFingerprint: string;
      winnerTeamId: string | null;
      downstreamMatchupId?: string;
    }
  | {
      type: "settle_check";
      resultFingerprint: string;
      winnerTeamId: string | null;
      downstreamMatchupId?: string;
    }
  | {
      type: "admin_confirm_original";
      downstreamMatchupId?: string;
    }
  | {
      type: "admin_override_corrected";
      downstreamMatchupId?: string;
    };

export type SeedLockEvent =
  | {
      type: "record_provisional_seed_lock";
      seedFingerprint: string;
    }
  | {
      type: "settle_check";
      seedFingerprint: string;
    }
  | {
      type: "admin_confirm_original";
    }
  | {
      type: "admin_relock_corrected";
    };

export type StateTransition<TState> = {
  nextState: TState;
  sideEffects: StateMachineSideEffect[];
};

function correctionWindowElapsed(
  lockedAt: Date | undefined,
  now: Date,
): boolean {
  if (lockedAt === undefined) {
    throw new Error("Cannot evaluate correction window without a lock time");
  }

  return now.getTime() - lockedAt.getTime() >= CORRECTION_WINDOW_MS;
}

function maybeResumeDownstreamBranch(
  downstreamMatchupId: string | undefined,
): StateMachineSideEffect {
  return {
    type: "resume_downstream_branch",
    entity: "matchup",
    ...(downstreamMatchupId === undefined ? {} : { downstreamMatchupId }),
  };
}

export function transitionMatchupState(
  currentState: MatchupState,
  event: MatchupEvent,
  now: Date,
): StateTransition<MatchupState> {
  if (event.type === "record_provisional_result") {
    // Only a pending/live matchup may record a result. under_review is FROZEN
    // (admin confirm/override is the only exit) and final is immutable —
    // re-recording either would wipe a review or clobber an override
    // (max-review findings A1/A2).
    if (currentState.status !== "pending" && currentState.status !== "live") {
      return { nextState: currentState, sideEffects: [] };
    }

    return {
      nextState: {
        ...currentState,
        status: "provisional",
        resultFingerprint: event.resultFingerprint,
        computedWinnerTeamId: event.winnerTeamId,
        overrideWinnerTeamId: undefined,
        lockedAt: now,
        settledAt: undefined,
        review: null,
      },
      sideEffects:
        event.winnerTeamId === null
          ? []
          : [
              {
                type: "advance_winner",
                entity: "matchup",
                winnerTeamId: event.winnerTeamId,
                ...(event.downstreamMatchupId === undefined
                  ? {}
                  : { downstreamMatchupId: event.downstreamMatchupId }),
              },
            ],
    };
  }

  if (event.type === "settle_check") {
    if (currentState.status !== "provisional") {
      return {
        nextState: currentState,
        sideEffects: [],
      };
    }

    const originalWinnerTeamId = currentState.computedWinnerTeamId ?? null;
    const winnerFlipped = originalWinnerTeamId !== event.winnerTeamId;
    const resultChanged =
      currentState.resultFingerprint !== event.resultFingerprint;

    if (winnerFlipped) {
      return {
        nextState: {
          ...currentState,
          status: "under_review",
          review: {
            originalWinnerTeamId,
            correctedWinnerTeamId: event.winnerTeamId,
            originalResultFingerprint: currentState.resultFingerprint ?? "",
            correctedResultFingerprint: event.resultFingerprint,
            detectedAt: now,
          },
        },
        sideEffects: [
          {
            type: "pause_downstream_branch",
            entity: "matchup",
            ...(event.downstreamMatchupId === undefined
              ? {}
              : { downstreamMatchupId: event.downstreamMatchupId }),
          },
          { type: "show_public_review_banner", entity: "matchup" },
        ],
      };
    }

    if (!correctionWindowElapsed(currentState.lockedAt, now)) {
      return {
        nextState: resultChanged
          ? {
              ...currentState,
              resultFingerprint: event.resultFingerprint,
              computedWinnerTeamId: event.winnerTeamId,
            }
          : currentState,
        sideEffects: resultChanged
          ? [{ type: "update_result", entity: "matchup" }]
          : [],
      };
    }

    return {
      nextState: {
        ...currentState,
        status: "final",
        resultFingerprint: event.resultFingerprint,
        computedWinnerTeamId: event.winnerTeamId,
        settledAt: now,
        review: null,
      },
      sideEffects: [
        ...(resultChanged
          ? [{ type: "update_result", entity: "matchup" } as const]
          : []),
        { type: "settle_result", entity: "matchup" },
      ],
    };
  }

  if (currentState.status !== "under_review" || currentState.review == null) {
    return {
      nextState: currentState,
      sideEffects: [],
    };
  }

  if (event.type === "admin_confirm_original") {
    return {
      nextState: {
        ...currentState,
        status: "final",
        resultFingerprint: currentState.review.originalResultFingerprint,
        computedWinnerTeamId: currentState.review.originalWinnerTeamId,
        overrideWinnerTeamId: undefined,
        settledAt: now,
        review: null,
      },
      sideEffects: [
        maybeResumeDownstreamBranch(event.downstreamMatchupId),
        { type: "settle_result", entity: "matchup" },
      ],
    };
  }

  const correctedWinnerTeamId = currentState.review.correctedWinnerTeamId;

  return {
    nextState: {
      ...currentState,
      status: "final",
      resultFingerprint: currentState.review.originalResultFingerprint,
      computedWinnerTeamId: currentState.review.originalWinnerTeamId,
      overrideWinnerTeamId: correctedWinnerTeamId,
      settledAt: now,
      review: null,
    },
    sideEffects: [
      // The corrected team must replace the original occupant downstream
      // (max-review finding B). A null corrected winner (corrected to a tie)
      // emits no advance — the consumer must rerun tiebreakers from the
      // effective result.
      ...(correctedWinnerTeamId === null
        ? []
        : [
            {
              type: "advance_winner",
              entity: "matchup",
              winnerTeamId: correctedWinnerTeamId,
              ...(event.downstreamMatchupId === undefined
                ? {}
                : { downstreamMatchupId: event.downstreamMatchupId }),
            } as const,
          ]),
      maybeResumeDownstreamBranch(event.downstreamMatchupId),
      { type: "settle_result", entity: "matchup" },
    ],
  };
}

export function transitionSeedLockState(
  currentState: SeedLockState,
  event: SeedLockEvent,
  now: Date,
): StateTransition<SeedLockState> {
  if (event.type === "record_provisional_seed_lock") {
    // A seed lock records once, from "none". Settled seeds are immutable for
    // the season (max-review finding C); under_review awaits admin resolution.
    if (currentState.status !== "none") {
      return { nextState: currentState, sideEffects: [] };
    }

    return {
      nextState: {
        ...currentState,
        status: "provisional",
        seedFingerprint: event.seedFingerprint,
        seedsLockedAt: now,
        seedsSettledAt: undefined,
        review: null,
      },
      sideEffects: [{ type: "lock_round_one_pairings", entity: "seed_lock" }],
    };
  }

  if (event.type === "settle_check") {
    if (currentState.status !== "provisional") {
      return {
        nextState: currentState,
        sideEffects: [],
      };
    }

    if (currentState.seedFingerprint !== event.seedFingerprint) {
      return {
        nextState: {
          ...currentState,
          status: "under_review",
          review: {
            originalSeedFingerprint: currentState.seedFingerprint ?? "",
            correctedSeedFingerprint: event.seedFingerprint,
            detectedAt: now,
          },
        },
        sideEffects: [
          { type: "freeze_round_one_pairings", entity: "seed_lock" },
          { type: "show_public_review_banner", entity: "seed_lock" },
        ],
      };
    }

    if (!correctionWindowElapsed(currentState.seedsLockedAt, now)) {
      return {
        nextState: currentState,
        sideEffects: [],
      };
    }

    return {
      nextState: {
        ...currentState,
        status: "settled",
        seedsSettledAt: now,
        review: null,
      },
      sideEffects: [{ type: "settle_result", entity: "seed_lock" }],
    };
  }

  if (currentState.status !== "under_review" || currentState.review == null) {
    return {
      nextState: currentState,
      sideEffects: [],
    };
  }

  if (event.type === "admin_confirm_original") {
    return {
      nextState: {
        ...currentState,
        status: "settled",
        seedFingerprint: currentState.review.originalSeedFingerprint,
        seedsSettledAt: now,
        review: null,
      },
      sideEffects: [{ type: "settle_result", entity: "seed_lock" }],
    };
  }

  return {
    nextState: {
      ...currentState,
      status: "settled",
      seedFingerprint: currentState.review.correctedSeedFingerprint,
      seedsSettledAt: now,
      review: null,
    },
    sideEffects: [
      { type: "replace_round_one_pairings", entity: "seed_lock" },
      { type: "settle_result", entity: "seed_lock" },
    ],
  };
}
