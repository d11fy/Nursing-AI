import { mobileCompatibilityError } from "@/lib/version/compatibility";
import { pageContentSecurityPolicy } from "@/lib/http/page-csp";
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
  function next(){
    if(pathname.startsWith("/api/"))return NextResponse.next();
    const nonce=Buffer.from(crypto.randomUUID()).toString("base64");
    const csp=pageContentSecurityPolicy(nonce,process.env.NODE_ENV!=="production");
    const headers=new Headers(request.headers);headers.set("x-nonce",nonce);headers.set("Content-Security-Policy",csp);
    const response=NextResponse.next({request:{headers}});response.headers.set("Content-Security-Policy",csp);return response;
  }

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

  const incompatible=mobileCompatibilityError(request);
  if(incompatible){const response=NextResponse.json(incompatible,{status:426});const origin=request.headers.get("origin");
    return origin&&isAllowedApiOrigin(origin,request.nextUrl.origin,process.env.APP_URL)?applyCorsHeaders(response,origin):response;}
  const protectedPage = pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/admin" || pathname.startsWith("/admin/");
  if (!protectedPage) {
    const response = next();
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
    if (await readSession(sessionToken,deviceToken,true)) return NextResponse.redirect(new URL("/security",request.url));
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/admin") && profile.role !== "admin") return NextResponse.redirect(new URL("/dashboard", request.url));
  const renewed = await refreshSession(sessionToken, deviceToken);
  if (!renewed || !sessionToken) return NextResponse.redirect(new URL("/login", request.url));
  const response = next();
  response.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions());
  response.cookies.set(DEVICE_COOKIE, renewed.deviceToken, deviceCookieOptions());
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|downloads/|.*\\.(?:png|jpg|webp|woff2|svg)$).*)"] };
