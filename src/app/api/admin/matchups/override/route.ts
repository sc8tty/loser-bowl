import { type NextRequest } from "next/server";
import { z } from "zod";

import { MissingDatabaseUrlError } from "@/db";
import { adminRedirect, requireAdminMutation } from "@/lib/admin/responses";
import { overrideMatchupWinner } from "@/lib/sync/matchupCompute";

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
    const now = new Date();
    const result = await overrideMatchupWinner(
      {
        matchupId: parsed.data.matchupId,
        winnerTeamId: parsed.data.winnerTeamId,
        overrideNote: parsed.data.overrideNote,
      },
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
