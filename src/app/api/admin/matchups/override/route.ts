import { eq } from "drizzle-orm";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { getDb, MissingDatabaseUrlError } from "@/db";
import { matchups } from "@/db/schema";
import { adminRedirect, requireAdminMutation } from "@/lib/admin/responses";
import { jsonFingerprint } from "@/lib/admin/state";
import { transitionMatchupState } from "@/lib/bracket/stateMachine";

export const dynamic = "force-dynamic";

const overrideSchema = z.object({
  matchupId: z.string().min(1),
  winnerTeamId: z.string().min(1),
  overrideNote: z.string().trim().min(1).max(1000),
});

export async function POST(request: NextRequest) {
  const blocked = requireAdminMutation(request);

  if (blocked !== null) {
    return blocked;
  }

  const parsed = overrideSchema.safeParse(
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

    const allowedWinnerIds = [matchup.highTeamId, matchup.lowTeamId].filter(
      (teamId): teamId is string => teamId !== null,
    );

    if (!allowedWinnerIds.includes(parsed.data.winnerTeamId)) {
      return adminRedirect(request, { error: "invalid_winner" });
    }

    const now = new Date();
    const update = {
      overrideWinnerTeamId: parsed.data.winnerTeamId,
      overrideNote: parsed.data.overrideNote,
      overriddenAt: now,
      ...(matchup.status === "under_review"
        ? {
            status: transitionMatchupState(
              {
                status: matchup.status,
                resultFingerprint: jsonFingerprint(matchup.computedTally),
                computedWinnerTeamId: matchup.computedWinnerTeamId,
                overrideWinnerTeamId: matchup.overrideWinnerTeamId,
                lockedAt: matchup.lockedAt ?? undefined,
                settledAt: matchup.settledAt ?? undefined,
                review: {
                  originalWinnerTeamId: matchup.computedWinnerTeamId ?? null,
                  correctedWinnerTeamId: parsed.data.winnerTeamId,
                  originalResultFingerprint: jsonFingerprint(matchup.computedTally),
                  correctedResultFingerprint: jsonFingerprint(matchup.computedTally),
                  detectedAt: now,
                },
              },
              { type: "admin_override_corrected" },
              now,
            ).nextState.status,
            settledAt: now,
          }
        : {}),
    };

    await db
      .update(matchups)
      .set(update)
      .where(eq(matchups.id, parsed.data.matchupId));

    return adminRedirect(request, { notice: "override_saved" });
  } catch (error) {
    if (error instanceof MissingDatabaseUrlError) {
      return adminRedirect(request, { error: "database" });
    }

    throw error;
  }
}
