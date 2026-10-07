import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { beginGoogleSignIn } from "@/lib/auth/google";
import { DEVICE_COOKIE, deviceCookieOptions } from "@/lib/auth/session";
import {
  decryptHandoff,
  encryptHandoff,
  MOBILE_FLOW_COOKIE,
} from "@/lib/auth/mobile";
import { mobileLoginInput } from "@/lib/auth/mobile-input";
export async function GET(request: NextRequest) {
  const ticket = request.nextUrl.searchParams.get("ticket") || "";
  if (!/^[A-Za-z0-9_-]{40,2048}$/.test(ticket))
    return new Response("رابط تسجيل الدخول غير صالح", { status: 400 });
  let payload: Record<string, unknown>;
  try {
    payload = decryptHandoff<Record<string, unknown>>(ticket);
  } catch {
    return new Response("رابط تسجيل الدخول غير صالح", { status: 400 });
  }
  const parsed = mobileLoginInput.safeParse(payload);
  if (
    !parsed.success ||
    typeof payload.expires !== "number" ||
    payload.expires <= Date.now()
  )
    return new Response("انتهت جلسة تسجيل الدخول؛ ارجع للتطبيق وحاول مجددًا", {
      status: 400,
    });
  try {
    const jar = await cookies();
    jar.set(DEVICE_COOKIE, parsed.data.deviceToken, deviceCookieOptions());
    jar.set(
      MOBILE_FLOW_COOKIE,
      encryptHandoff({
        challenge: parsed.data.challenge,
        state: parsed.data.state,
        scheme: parsed.data.scheme,
        expires: payload.expires,
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      },
    );
    return NextResponse.redirect(
      await beginGoogleSignIn("/auth/mobile/complete"),
    );
  } catch {
    return NextResponse.redirect(
      `${parsed.data.scheme}://auth?${new URLSearchParams({ error: "google_config", state: parsed.data.state })}`,
    );
  }
}
