import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin/session";

export function isAdminRequestAuthenticated(request: NextRequest): boolean {
  return verifyAdminSessionToken(
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value,
    process.env.ADMIN_SESSION_SECRET,
  );
}

export async function isAdminCookieAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();

  return verifyAdminSessionToken(
    cookieStore.get(ADMIN_SESSION_COOKIE)?.value,
    process.env.ADMIN_SESSION_SECRET,
  );
}

export async function requireAdminPage(): Promise<void> {
  if (!(await isAdminCookieAuthenticated())) {
    redirect("/admin/login");
  }
}
