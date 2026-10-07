import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getSettings } from "@/lib/usage";
import {
  getStudyPackWorkspace,
  getLibraryStudyPackWorkspace,
} from "@/features/study-pack/services/study-pack-service";
import { getStudyPackById } from "@/features/study-pack/db/study-pack-db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await createClient();
    const user = db.actor;
    if (!user || user.status !== "active") {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get("type"); // 'lecture' | 'library'

    const settings = await getSettings(db);

    let workspaceData;
    if (typeParam === "lecture") {
      workspaceData = await getStudyPackWorkspace(id, user.user_id);
    } else if (typeParam === "library") {
      workspaceData = await getLibraryStudyPackWorkspace(id, user.user_id);
    } else {
      // 1. Try finding by studyPackId first
      const pack = await getStudyPackById(id, user.user_id);
      if (pack) {
        if (pack.lecture_id) {
          workspaceData = await getStudyPackWorkspace(pack.lecture_id, user.user_id);
        } else if (pack.document_id) {
          workspaceData = await getLibraryStudyPackWorkspace(pack.document_id, user.user_id);
        }
      }

      // 2. Try lecture workspace
      if (!workspaceData) {
        try {
          workspaceData = await getStudyPackWorkspace(id, user.user_id);
        } catch {}
      }

      // 3. Try library document workspace
      if (!workspaceData) {
        try {
          workspaceData = await getLibraryStudyPackWorkspace(id, user.user_id);
        } catch {}
      }
    }

    if (!workspaceData) {
      return NextResponse.json({ error: "حزمة الدراسة غير موجودة" }, { status: 404 });
    }

    return NextResponse.json({
      workspaceData,
      maxImageSizeMb: settings.maxImageSizeMb,
    });
  } catch (error) {
    console.error("GET /api/study-packs/[id] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر تحميل حزمة الدراسة" },
      { status: 500 }
    );
  }
}
