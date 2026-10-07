import { NextResponse, type NextRequest } from "next/server";
import {
  DEVICE_COOKIE,
  deviceCookieOptions,
  readSession,
  refreshSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { API_CORS_HEADERS, isAllowedApiOrigin } from "@/lib/http/cors";

function applyCorsHeaders(response: NextResponse, origin: string) {
  response.headers.set("Access-Control-Allow-Origin", origin);
  for (const [name, value] of Object.entries(API_CORS_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Handle CORS and mobile requests for API routes
  if (pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin");
    const originAllowed = isAllowedApiOrigin(
      origin,
      request.nextUrl.origin,
      process.env.APP_URL,
    );

    if (request.method === "OPTIONS") {
      if (!origin || !originAllowed) {
        return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
      }
      return applyCorsHeaders(new NextResponse(null, { status: 204 }), origin);
    }

    if (!["GET", "HEAD"].includes(request.method)) {
      if (!originAllowed) {
        return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
      }
    }
  }

  const protectedPage = pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/admin" || pathname.startsWith("/admin/");
  if (!protectedPage) {
    const response = NextResponse.next();
    const origin = request.headers.get("origin");
    if (
      pathname.startsWith("/api/") &&
      origin &&
      isAllowedApiOrigin(origin, request.nextUrl.origin, process.env.APP_URL)
    ) {
      return applyCorsHeaders(response, origin);
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
