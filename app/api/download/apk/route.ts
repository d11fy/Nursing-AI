import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getAppVersionInfo } from "@/lib/version/app-version";

export async function GET() {
  try {
    const versionInfo = await getAppVersionInfo();
    const apkFileName = `nursing-ai-v${versionInfo.latest_version}.apk`;
    const apkFilePath = path.join(process.cwd(), "public", "downloads", "nursing-ai-latest.apk");

    if (!fs.existsSync(apkFilePath)) {
      return NextResponse.json(
        { error: "ملف الـ APK غير متوفر حالياً على الخادم" },
        { status: 404 }
      );
    }

    const stat = fs.statSync(apkFilePath);
    const fileStream = fs.createReadStream(apkFilePath);

    // Convert node readstream to web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        fileStream.on("data", (chunk) => controller.enqueue(chunk));
        fileStream.on("end", () => controller.close());
        fileStream.on("error", (err) => controller.error(err));
      },
      cancel() {
        fileStream.destroy();
      },
    });

    return new NextResponse(webStream as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": `attachment; filename="${apkFileName}"`,
        "Content-Length": stat.size.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("APK download error:", error);
    return NextResponse.json({ error: "فشل تنزيل ملف الـ APK" }, { status: 500 });
  }
}
