import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
    await endSession(bearer);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Auth logout API error:", error);
    return NextResponse.json({ error: "تعذر تسجيل الخروج" }, { status: 500 });
  }
}
