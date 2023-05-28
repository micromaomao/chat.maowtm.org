import { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { NextRequest, NextResponse } from "next/server";

export async function checkAdminAuthentication(request: NextRequest): Promise<boolean> {
  return false;
}
export async function serverComponentCheckAdminAuthentication(cookies: ReadonlyRequestCookies): Promise<boolean> {
  return false;
}

export async function makeUnauthenticatedResponse(request: NextRequest): Promise<NextResponse> {
  return new NextResponse("Unauthorized", {
    status: 401, headers: {
      "Content-Type": "text/plain"
    }
  });
}
