import { type NextRequest } from "next/server";

import { MissingDatabaseUrlError } from "@/db";
import { adminRedirect, requireAdminMutation } from "@/lib/admin/responses";
import { runSync } from "@/lib/sync/engine";
import { dbSyncDeps } from "@/lib/sync/lock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const blocked = requireAdminMutation(request);

  if (blocked !== null) {
    return blocked;
  }

  try {
    const outcome = await runSync("admin", dbSyncDeps());

    if (!outcome.ran) {
      return adminRedirect(request, { notice: "sync_skipped" });
    }

    if (outcome.status === "error") {
      return adminRedirect(request, { error: "sync_error" });
    }

    return adminRedirect(request, { notice: "sync_started" });
  } catch (error) {
    if (error instanceof MissingDatabaseUrlError) {
      return adminRedirect(request, { error: "database" });
    }

    throw error;
  }
}
