import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuthentication, makeUnauthenticatedResponse } from './lib/auth';

export async function middleware(request: NextRequest) {
  let pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/admin/") || pathname === "/admin") {
    let hasAuth = await checkAdminAuthentication(request);
    if (!hasAuth && pathname !== "/admin/login") {
      if (request.headers.get("accept")?.startsWith("application/json")) {
        return makeUnauthenticatedResponse(request);
      }
      return NextResponse.redirect(new URL("/admin/login", request.url), {
        headers: { "Cache-Control": "no-store" }
      });
    }
  }
  if ((pathname.startsWith("/api/admin/") || pathname === "/api/admin") &&
    pathname !== "/api/admin/login") {
    let hasAuth = await checkAdminAuthentication(request);
    if (!hasAuth) {
      return makeUnauthenticatedResponse(request);
    }
  }
  return NextResponse.next();
}
