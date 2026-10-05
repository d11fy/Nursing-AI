import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/db/server";
import { LibraryError, setLibraryFavorite } from "@/lib/library";

const schema = z.object({ documentId: z.string().uuid(), favorite: z.boolean() });

export async function PUT(request: Request) {
  const db = await createClient();
  const user = db.actor;
  if (!user || user.status !== "active") return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "بيانات المفضلة غير صالحة" }, { status: 400 });
  try {
    await setLibraryFavorite(user.user_id, parsed.data.documentId, parsed.data.favorite);
    return NextResponse.json({ favorite: parsed.data.favorite });
  } catch (error) {
    const status = error instanceof LibraryError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحديث المفضلة" }, { status });
  }
}
