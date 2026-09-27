import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : request.nextUrl.origin;
    if (request.headers.get("origin") !== expected) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  const protectedPage = pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/admin" || pathname.startsWith("/admin/");
  if (!protectedPage) return NextResponse.next();
  const profile = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!profile) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/admin") && profile.role !== "admin") return NextResponse.redirect(new URL("/dashboard", request.url));
  return NextResponse.next();
}
export const config = { matcher: ["/dashboard/:path*", "/admin/:path*", "/api/:path*"] };
