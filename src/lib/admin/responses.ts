import { NextResponse, type NextRequest } from "next/server";

import { isAllowedAdminRequestOrigin } from "@/lib/admin/csrf";
import { isAdminRequestAuthenticated } from "@/lib/admin/guard";

export function adminRedirect(
  request: Request,
  params: Record<string, string>,
): NextResponse {
  const url = new URL("/admin", request.url);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url, 303);
}

export function loginRedirect(
  request: Request,
  params: Record<string, string> = {},
): NextResponse {
  const url = new URL("/admin/login", request.url);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url, 303);
}

export function requireAdminMutation(request: NextRequest): NextResponse | null {
  if (!isAdminRequestAuthenticated(request)) {
    return loginRedirect(request, { error: "expired" });
  }

  if (!isAllowedAdminRequestOrigin(request)) {
    return adminRedirect(request, { error: "csrf" });
  }

  return null;
}
