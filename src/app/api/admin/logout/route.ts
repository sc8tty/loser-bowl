import { type NextRequest, NextResponse } from "next/server";

import { isAllowedAdminRequestOrigin } from "@/lib/admin/csrf";
import { loginRedirect } from "@/lib/admin/responses";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAllowedAdminRequestOrigin(request)) {
    return loginRedirect(request, { error: "csrf" });
  }

  const response = NextResponse.redirect(new URL("/admin/login", request.url), 303);

  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });

  return response;
}
