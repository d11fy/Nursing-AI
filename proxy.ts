import { NextResponse, type NextRequest } from "next/server";
import {
  DEVICE_COOKIE,
  deviceCookieOptions,
  readSession,
  refreshSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : request.nextUrl.origin;
    if (request.headers.get("origin") !== expected) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  const protectedPage = pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/admin" || pathname.startsWith("/admin/");
  if (!protectedPage) return NextResponse.next();
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  const deviceToken = request.cookies.get(DEVICE_COOKIE)?.value;
  const profile = await readSession(sessionToken, deviceToken);
  if (!profile) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/admin") && profile.role !== "admin") return NextResponse.redirect(new URL("/dashboard", request.url));
  const renewed = await refreshSession(sessionToken, deviceToken);
  if (!renewed || !sessionToken) return NextResponse.redirect(new URL("/login", request.url));
  const response = NextResponse.next();
  response.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions());
  response.cookies.set(DEVICE_COOKIE, renewed.deviceToken, deviceCookieOptions());
  return response;
}
export const config = { matcher: ["/dashboard/:path*", "/admin/:path*", "/api/:path*"] };
