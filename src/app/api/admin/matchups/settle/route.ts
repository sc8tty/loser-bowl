import { eq } from "drizzle-orm";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { getDb, MissingDatabaseUrlError } from "@/db";
import { matchups } from "@/db/schema";
import { adminRedirect, requireAdminMutation } from "@/lib/admin/responses";
import { jsonFingerprint } from "@/lib/admin/state";
import { transitionMatchupState } from "@/lib/bracket/stateMachine";

export const dynamic = "force-dynamic";

const settleSchema = z.object({
  matchupId: z.string().min(1),
  action: z.enum(["settle_provisional", "confirm_original"]),
});

export async function POST(request: NextRequest) {
  const blocked = requireAdminMutation(request);

  if (blocked !== null) {
    return blocked;
  }

  const parsed = settleSchema.safeParse(
    Object.fromEntries(await request.formData()),
  );

  if (!parsed.success) {
    return adminRedirect(request, { error: "invalid" });
  }

  try {
    const db = getDb();
    const matchup = (
      await db
        .select()
        .from(matchups)
        .where(eq(matchups.id, parsed.data.matchupId))
        .limit(1)
    )[0];

    if (matchup === undefined) {
      return adminRedirect(request, { error: "missing_matchup" });
    }

    const now = new Date();
    const fingerprint = jsonFingerprint(matchup.computedTally);

    if (parsed.data.action === "settle_provisional") {
      if (matchup.status !== "provisional") {
        return adminRedirect(request, { error: "invalid_state" });
      }

      if (matchup.lockedAt === null) {
        return adminRedirect(request, { error: "missing_lock_time" });
      }

      const transition = transitionMatchupState(
        {
          status: matchup.status,
          resultFingerprint: fingerprint,
          computedWinnerTeamId: matchup.computedWinnerTeamId,
          overrideWinnerTeamId: matchup.overrideWinnerTeamId,
          lockedAt: matchup.lockedAt,
          settledAt: matchup.settledAt ?? undefined,
          review: null,
        },
        {
          type: "settle_check",
          resultFingerprint: fingerprint,
          winnerTeamId: matchup.computedWinnerTeamId,
        },
        now,
      );

      if (transition.nextState.status === "provisional") {
        return adminRedirect(request, { notice: "matchup_window_open" });
      }

      await db
        .update(matchups)
        .set({
          status: transition.nextState.status,
          computedWinnerTeamId: transition.nextState.computedWinnerTeamId ?? null,
          settledAt: transition.nextState.settledAt ?? now,
        })
        .where(eq(matchups.id, parsed.data.matchupId));

      return adminRedirect(request, { notice: "matchup_settled" });
    }

    if (matchup.status !== "under_review") {
      return adminRedirect(request, { error: "invalid_state" });
    }

    const transition = transitionMatchupState(
      {
        status: matchup.status,
        resultFingerprint: fingerprint,
        computedWinnerTeamId: matchup.computedWinnerTeamId,
        overrideWinnerTeamId: matchup.overrideWinnerTeamId,
        lockedAt: matchup.lockedAt ?? undefined,
        settledAt: matchup.settledAt ?? undefined,
        review: {
          originalWinnerTeamId: matchup.computedWinnerTeamId ?? null,
          correctedWinnerTeamId: matchup.overrideWinnerTeamId ?? null,
          originalResultFingerprint: fingerprint,
          correctedResultFingerprint: fingerprint,
          detectedAt: now,
        },
      },
      { type: "admin_confirm_original" },
      now,
    );

    await db
      .update(matchups)
      .set({
        status: transition.nextState.status,
        computedWinnerTeamId: transition.nextState.computedWinnerTeamId ?? null,
        overrideWinnerTeamId: null,
        overrideNote: null,
        overriddenAt: null,
        settledAt: transition.nextState.settledAt ?? now,
      })
      .where(eq(matchups.id, parsed.data.matchupId));

    return adminRedirect(request, { notice: "matchup_confirmed" });
  } catch (error) {
    if (error instanceof MissingDatabaseUrlError) {
      return adminRedirect(request, { error: "database" });
    }

    throw error;
  }
}
