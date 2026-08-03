import { type NextRequest } from "next/server";
import { z } from "zod";

import { MissingDatabaseUrlError } from "@/db";
import { adminRedirect, requireAdminMutation } from "@/lib/admin/responses";
import {
  confirmOriginalMatchup,
  settleMatchupProvisional,
} from "@/lib/sync/matchupCompute";

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
    const now = new Date();

    if (parsed.data.action === "settle_provisional") {
      const result = await settleMatchupProvisional(parsed.data.matchupId, {
        now: () => now,
      });

      return result.ok
        ? adminRedirect(request, { notice: result.notice })
        : adminRedirect(request, { error: result.error });
    }

    const result = await confirmOriginalMatchup(parsed.data.matchupId, {
      now: () => now,
    });

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
