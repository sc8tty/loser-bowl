import { eq } from "drizzle-orm";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { getDb, MissingDatabaseUrlError } from "@/db";
import { syncState } from "@/db/schema";
import { adminRedirect, requireAdminMutation } from "@/lib/admin/responses";
import { processSeedLock, resolveSeedLockReview } from "@/lib/sync/seedLock";

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
    const now = new Date();

    if (parsed.data.action === "settle_provisional") {
      const db = getDb();
      const state = (
        await db.select().from(syncState).where(eq(syncState.id, 1)).limit(1)
      )[0];

      if (state?.seedLockStatus !== "provisional") {
        return adminRedirect(request, { error: "invalid_state" });
      }

      const result = await processSeedLock({ now: () => now });

      if (result.action === "none" && result.reason === "settle_window_open") {
        return adminRedirect(request, { notice: "seed_lock_window_open" });
      }

      if (result.action === "settle" && result.applied) {
        return adminRedirect(request, { notice: "seed_lock_settled" });
      }

      if (result.action === "flag_review" && result.applied) {
        return adminRedirect(request, { notice: "seed_lock_under_review" });
      }

      return adminRedirect(request, {
        error:
          result.reason === "missing_lock_time"
            ? "missing_lock_time"
            : "invalid_state",
      });
    }

    const result = await resolveSeedLockReview(
      parsed.data.action === "confirm_original"
        ? "confirm_original"
        : "relock_corrected",
      { now: () => now },
    );

    return result.ok
      ? adminRedirect(request, { notice: result.notice })
      : adminRedirect(request, { error: result.error });
  } catch (error) {
    if (error instanceof MissingDatabaseUrlError) {
      return adminRedirect(request, { error: "database" });
    }

    throw error;
  }
}
