import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminProfileOrNull } from "@/lib/auth";
import { processDocument } from "@/lib/knowledge";

const schema = z.object({ documentId: z.string().uuid() });

export async function POST(request: Request) {
  const admin = await getAdminProfileOrNull();
  if (!admin) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  try {
    await processDocument(parsed.data.documentId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر بدء المعالجة" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
