import { NextResponse } from "next/server";
import fs from "fs";
import { getPublicReleaseInfo, STABLE_APK_PATH } from "@/lib/version/app-version";

export async function GET() {
  try {
    const versionInfo = await getPublicReleaseInfo();
    const apkFileName = `nursing-ai-v${versionInfo.latest_version}.apk`;
    const apkFilePath = STABLE_APK_PATH;

    // Never serve a file that differs from the published checksum: it would
    // install something other than the announced, signed release.
    if (versionInfo.integrity === "mismatch") {
      console.error("APK checksum does not match the published release");
      return NextResponse.json(
        { error: "ملف التحديث قيد التجهيز، حاول بعد قليل" },
        { status: 503 }
      );
    }

    if (!fs.existsSync(apkFilePath)) {
      return NextResponse.json(
        { error: "ملف الـ APK غير متوفر حالياً على الخادم" },
        { status: 404 }
      );
    }

    const stat = fs.statSync(apkFilePath);
    const fileStream = fs.createReadStream(apkFilePath);

    // Convert node readstream to web ReadableStream
    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        fileStream.on("data", (chunk) =>
          controller.enqueue(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk)
        );
        fileStream.on("end", () => controller.close());
        fileStream.on("error", (err) => controller.error(err));
      },
      cancel() {
        fileStream.destroy();
      },
    });

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": `attachment; filename="${apkFileName}"`,
        "Content-Length": stat.size.toString(),
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        ...(versionInfo.served_sha256 ? { "X-Checksum-SHA256": versionInfo.served_sha256 } : {}),
      },
    });
  } catch {
    console.error("APK download failed");
    return NextResponse.json({ error: "فشل تنزيل ملف الـ APK" }, { status: 500 });
  }
}
