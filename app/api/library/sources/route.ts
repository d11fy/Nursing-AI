import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/db/server";
import { attachLibrarySource, LibraryError, removeLibrarySource } from "@/lib/library";

const attachSchema = z.object({
  conversationId: z.string().uuid().optional().nullable(),
  documentId: z.string().uuid(),
  subjectId: z.string().uuid().optional().nullable(),
});
const removeSchema = z.object({ conversationId: z.string().uuid(), documentId: z.string().uuid() });

function errorResponse(error: unknown) {
  if (error instanceof LibraryError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: "تعذر تحديث مصادر المحادثة" }, { status: 500 });
}

export async function POST(request: Request) {
  const db = await createClient();
  const user = db.actor;
  if (!user || user.status !== "active") return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const parsed = attachSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "بيانات المصدر غير صالحة" }, { status: 400 });
  try {
    return NextResponse.json(await attachLibrarySource(user.user_id, parsed.data), { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  const db = await createClient();
  const user = db.actor;
  if (!user || user.status !== "active") return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const parsed = removeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "بيانات المصدر غير صالحة" }, { status: 400 });
  try {
    await removeLibrarySource(user.user_id, parsed.data.conversationId, parsed.data.documentId);
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

