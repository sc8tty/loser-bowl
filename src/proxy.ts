import { NextResponse, type NextRequest } from "next/server";

import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin/session";

const LOGIN_PATH = "/admin/login";
const LOGIN_API_PATH = "/api/admin/login";

function isPublicAdminPath(pathname: string): boolean {
  return pathname === LOGIN_PATH || pathname === LOGIN_API_PATH;
}

function isAuthenticated(request: NextRequest): boolean {
  return verifyAdminSessionToken(
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value,
    process.env.ADMIN_SESSION_SECRET,
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/api/sync" && request.method === "GET") {
    return NextResponse.next();
  }

  if (isPublicAdminPath(pathname) || isAuthenticated(request)) {
    return NextResponse.next();
  }

  const loginUrl = new URL(LOGIN_PATH, request.url);

  if (pathname !== "/admin") {
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  }

  return NextResponse.redirect(loginUrl, 303);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/api/sync"],
};
