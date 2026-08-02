import { NextResponse } from "next/server";

import { runSync } from "@/lib/sync/engine";
import { dbSyncDeps } from "@/lib/sync/lock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily cron backstop (PRD): Vercel invokes with the CRON_SECRET bearer. */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const outcome = await runSync("cron", dbSyncDeps());

  return NextResponse.json(outcome);
}

/** Admin-triggered sync lands with Issue 11 (cookie auth + CSRF). */
export async function POST() {
  return NextResponse.json(
    { error: "admin sync not yet wired (Issue 11)" },
    { status: 501 },
  );
}
