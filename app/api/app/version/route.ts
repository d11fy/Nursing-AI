import { NextResponse } from "next/server";
import { getAppVersionInfo } from "@/lib/version/app-version";

export async function GET() {
  try {
    const versionInfo = await getAppVersionInfo();
    return NextResponse.json(versionInfo, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error fetching app version:", error);
    return NextResponse.json(
      { error: "تعذر استرجاع معلومات الإصدار" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
