import { NextResponse } from "next/server";
import { createMobileHandoff } from "@/lib/auth/mobile";
export async function GET() {
  try {
    return NextResponse.redirect(await createMobileHandoff());
  } catch {
    return new Response("انتهت جلسة الدخول. ارجع إلى التطبيق وحاول مجددًا.", {
      status: 400,
    });
  }
}
