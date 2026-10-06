import { NextResponse, type NextRequest } from "next/server";
import { finishGoogleSignIn } from "@/lib/auth/google";
import { DeviceConflictError } from "@/lib/auth/session-store";

export async function GET(request: NextRequest) {
  const publicOrigin = process.env.APP_URL?.trim();
  const redirectBase = publicOrigin ? new URL(publicOrigin).origin : request.nextUrl.origin;
  const error = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (error || !code || !state) {
    return NextResponse.redirect(new URL("/login?error=google_cancelled", redirectBase));
  }
  try {
    const result = await finishGoogleSignIn(code, state);
    return NextResponse.redirect(new URL(result.redirectTo, redirectBase));
  } catch (cause) {
    console.error("Google sign-in callback failed", cause);
    const errorCode = cause instanceof DeviceConflictError ? "device_in_use" : "google_failed";
    return NextResponse.redirect(new URL(`/login?error=${errorCode}`, redirectBase));
  }
}
