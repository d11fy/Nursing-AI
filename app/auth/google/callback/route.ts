import { NextResponse, type NextRequest } from "next/server";
import { finishGoogleSignIn } from "@/lib/auth/google";
import { mobileFlow } from "@/lib/auth/mobile";
import { DeviceConflictError } from "@/lib/auth/session-store";

export async function GET(request: NextRequest) {
  const publicOrigin = process.env.APP_URL?.trim();
  const redirectBase = publicOrigin
    ? new URL(publicOrigin).origin
    : request.nextUrl.origin;
  const error = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const mobile = await mobileFlow();
  const failure = (reason: string) =>
    mobile
      ? NextResponse.redirect(
          `${mobile.scheme}://auth?${new URLSearchParams({ error: reason, state: mobile.state })}`,
        )
      : NextResponse.redirect(new URL(`/login?error=${reason}`, redirectBase));
  if (error || !code || !state) {
    return failure("google_cancelled");
  }
  try {
    const result = await finishGoogleSignIn(code, state);
    return NextResponse.redirect(new URL(result.redirectTo, redirectBase));
  } catch (cause) {
    console.error("Google sign-in callback failed", cause);
    const errorCode =
      cause instanceof DeviceConflictError ? "device_in_use" : "google_failed";
    return failure(errorCode);
  }
}
