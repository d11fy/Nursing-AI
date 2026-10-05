import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/db/server";
import { getOrCreateLibraryStudyPack } from "@/features/study-pack/db/study-pack-db";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient();
  const user = db.actor;
  if (!user || user.status !== "active") return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "معرّف المصدر غير صالح" }, { status: 400 });
  try {
    const studyPack = await getOrCreateLibraryStudyPack(id.data, user.user_id);
    return NextResponse.json({ studyPackId: studyPack.id, url: `/dashboard/library/${id.data}/study-pack` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر إنشاء حزمة الدراسة" }, { status: 403 });
  }
}
