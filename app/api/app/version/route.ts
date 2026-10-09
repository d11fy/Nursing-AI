import { MINIMUM_MOBILE_VERSION_CODE } from "@/lib/version/compatibility";
import { NextResponse } from "next/server";
import { getPublicReleaseInfo } from "@/lib/version/app-version";

/** Stable release used by the in-app update check; the preview channel is never offered as an update. */
export async function GET() {
  try {
    const release = await getPublicReleaseInfo();
    return NextResponse.json({
      latest_version: release.latest_version,
      latest_version_code: release.latest_version_code,
      apk_url: release.apk_url,
      release_notes: release.release_notes,
      force_update: release.force_update || (release.integrity === "verified" && release.latest_version_code >= MINIMUM_MOBILE_VERSION_CODE),
      minimum_supported_version_code: MINIMUM_MOBILE_VERSION_CODE,
      published_at: release.published_at,
      file_size: release.file_size,
      sha256: release.integrity === "verified" ? release.served_sha256 : null,
      available: release.integrity === "verified" || release.integrity === "unpublished",
    }, {
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
