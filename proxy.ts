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

  // Handle CORS and mobile requests for API routes
  if (pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin");
    const isMobileOrigin =
      !origin ||
      origin === "http://localhost" ||
      origin === "https://localhost" ||
      origin.startsWith("capacitor://") ||
      request.headers.has("x-device-token") ||
      Boolean(request.headers.get("authorization")?.startsWith("Bearer "));

    if (request.method === "OPTIONS") {
      const preflight = new NextResponse(null, { status: 204 });
      if (origin) {
        preflight.headers.set("Access-Control-Allow-Origin", origin);
        preflight.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
        preflight.headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Device-Token,X-Subject-Id,X-Conversation-Id");
        preflight.headers.set("Access-Control-Allow-Credentials", "true");
        preflight.headers.set("Access-Control-Expose-Headers", "X-Conversation-Id,X-Subject-Id");
      }
      return preflight;
    }

    if (!["GET", "HEAD"].includes(request.method)) {
      const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : request.nextUrl.origin;
      if (origin && origin !== expected && !isMobileOrigin) {
        return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
      }
    }
  }

  const protectedPage = pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/admin" || pathname.startsWith("/admin/");
  if (!protectedPage) {
    const response = NextResponse.next();
    const origin = request.headers.get("origin");
    if (pathname.startsWith("/api/") && origin) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      response.headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Device-Token,X-Subject-Id,X-Conversation-Id");
      response.headers.set("Access-Control-Allow-Credentials", "true");
      response.headers.set("Access-Control-Expose-Headers", "X-Conversation-Id,X-Subject-Id");
    }
    return response;
  }
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
