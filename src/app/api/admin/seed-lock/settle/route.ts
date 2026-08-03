import { eq } from "drizzle-orm";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { getDb, MissingDatabaseUrlError } from "@/db";
import { syncState } from "@/db/schema";
import { adminRedirect, requireAdminMutation } from "@/lib/admin/responses";
import { jsonFingerprint } from "@/lib/admin/state";
import { transitionSeedLockState } from "@/lib/bracket/stateMachine";

export const dynamic = "force-dynamic";

const seedLockSchema = z.object({
  action: z.enum(["settle_provisional", "confirm_original", "relock_corrected"]),
});

export async function POST(request: NextRequest) {
  const blocked = requireAdminMutation(request);

  if (blocked !== null) {
    return blocked;
  }

  const parsed = seedLockSchema.safeParse(
    Object.fromEntries(await request.formData()),
  );

  if (!parsed.success) {
    return adminRedirect(request, { error: "invalid" });
  }

  try {
    const db = getDb();
    const state = (
      await db.select().from(syncState).where(eq(syncState.id, 1)).limit(1)
    )[0];

    if (state === undefined) {
      return adminRedirect(request, { error: "database" });
    }

    const now = new Date();
    const fingerprint = jsonFingerprint(state.seedsSnapshot);

    if (parsed.data.action === "settle_provisional") {
      if (state.seedLockStatus !== "provisional") {
        return adminRedirect(request, { error: "invalid_state" });
      }

      if (state.seedsLockedAt === null) {
        return adminRedirect(request, { error: "missing_lock_time" });
      }

      const transition = transitionSeedLockState(
        {
          status: state.seedLockStatus,
          seedFingerprint: fingerprint,
          seedsLockedAt: state.seedsLockedAt,
          seedsSettledAt: state.seedsSettledAt ?? undefined,
          review: null,
        },
        { type: "settle_check", seedFingerprint: fingerprint },
        now,
      );

      if (transition.nextState.status === "provisional") {
        return adminRedirect(request, { notice: "seed_lock_window_open" });
      }

      await db
        .update(syncState)
        .set({
          seedLockStatus: transition.nextState.status,
          seedsSettledAt: transition.nextState.seedsSettledAt ?? now,
        })
        .where(eq(syncState.id, 1));

      return adminRedirect(request, { notice: "seed_lock_settled" });
    }

    if (state.seedLockStatus !== "under_review") {
      return adminRedirect(request, { error: "invalid_state" });
    }

    const transition = transitionSeedLockState(
      {
        status: state.seedLockStatus,
        seedFingerprint: fingerprint,
        seedsLockedAt: state.seedsLockedAt ?? undefined,
        seedsSettledAt: state.seedsSettledAt ?? undefined,
        review: {
          originalSeedFingerprint: fingerprint,
          correctedSeedFingerprint: fingerprint,
          detectedAt: now,
        },
      },
      parsed.data.action === "confirm_original"
        ? { type: "admin_confirm_original" }
        : { type: "admin_relock_corrected" },
      now,
    );

    await db
      .update(syncState)
      .set({
        seedLockStatus: transition.nextState.status,
        seedsSettledAt: transition.nextState.seedsSettledAt ?? now,
      })
      .where(eq(syncState.id, 1));

    return adminRedirect(request, {
      notice:
        parsed.data.action === "confirm_original"
          ? "seed_lock_confirmed"
          : "seed_lock_relocked",
    });
  } catch (error) {
    if (error instanceof MissingDatabaseUrlError) {
      return adminRedirect(request, { error: "database" });
    }

    throw error;
  }
}
