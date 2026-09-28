import { NextResponse, type NextRequest } from "next/server";
import { beginGoogleSignIn } from "@/lib/auth/google";

export async function GET(request: NextRequest) {
  try {
    const url = await beginGoogleSignIn(request.nextUrl.searchParams.get("redirect"));
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Google sign-in start failed", error);
    return NextResponse.redirect(new URL("/login?error=google_config", request.url));
  }
}
