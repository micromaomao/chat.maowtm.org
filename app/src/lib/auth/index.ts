import type { RequestCookies } from "next/dist/compiled/@edge-runtime/cookies";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { NextRequest, NextResponse } from "next/server";

export async function checkAdminAuthentication(request: NextRequest): Promise<boolean> {
  return serverComponentCheckAdminAuthentication(request.cookies);
}
export async function serverComponentCheckAdminAuthentication(cookies: ReadonlyRequestCookies | RequestCookies): Promise<boolean> {
  if (cookies.get("logged_in")?.value === "true") {
    return true;
  }
  return false;
}

export function makeUnauthenticatedResponse(request: NextRequest): NextResponse {
  return new NextResponse("Unauthorized", {
    status: 401, headers: {
      "Content-Type": "text/plain"
    }
  });
}
