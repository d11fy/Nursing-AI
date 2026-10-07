import { NextResponse } from "next/server";
import { getAppVersionInfo } from "@/lib/version/app-version";

export async function GET() {
  try {
    const versionInfo = await getAppVersionInfo();
    return NextResponse.json(versionInfo, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "تعذر استرجاع معلومات الإصدار" },
      { status: 500 }
    );
  }
}
