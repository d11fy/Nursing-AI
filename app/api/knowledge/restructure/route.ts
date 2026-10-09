import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminProfileOrNull } from "@/lib/auth";
import { workerDb } from "@/lib/tutor/db";
import { rebuildDocumentStructure } from "@/lib/tutor/restructure";

const schema = z.object({ documentId: z.string().uuid(), force: z.boolean().optional() });

/**
 * Re-detects chapters, sections and chunk labels of an existing book: no duplicate, and no re-embedding when
 * the chunk texts are unchanged. Accepts the admin list id (documents.id) or the knowledge document id.
 */
export async function POST(request: Request) {
  const admin = await getAdminProfileOrNull();
  if (!admin) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const found = (await workerDb.query<{ id: string }>("select id from knowledge_documents where id=$1 or legacy_document_id=$1 limit 1", [parsed.data.documentId])).rows[0];
  if (!found) return NextResponse.json({ error: "المستند غير موجود" }, { status: 404 });
  try {
    return NextResponse.json({ ok: true, result: await rebuildDocumentStructure(found.id, { force: parsed.data.force }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذرت إعادة بناء بنية الكتاب" }, { status: 409 });
  }
}
