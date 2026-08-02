import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { runSync } from "@/lib/sync/engine";
import { dbSyncDeps } from "@/lib/sync/lock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function bearerMatches(authorization: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization ?? "");

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

/** Daily cron backstop (PRD): Vercel invokes with the CRON_SECRET bearer. */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || !bearerMatches(request.headers.get("authorization"), cronSecret)) {
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
