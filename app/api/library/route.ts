import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/db/server";
import { listLibraryResources } from "@/lib/library";
import { RESOURCE_CATEGORIES, type ResourceCategory } from "@/lib/library-types";

const categoryValues = RESOURCE_CATEGORIES.map((item) => item.value) as [ResourceCategory, ...ResourceCategory[]];
const querySchema = z.object({
  subjectId: z.string().uuid().optional(),
  category: z.enum(categoryValues).optional(),
  semester: z.coerce.number().int().min(1).max(2).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(30).default(18),
});

export async function GET(request: Request) {
  const db = await createClient();
  const user = db.actor;
  if (!user || user.status !== "active") return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: "مرشحات المكتبة غير صالحة" }, { status: 400 });
  try {
    const catalog = await listLibraryResources(user.user_id, {
      subjectId: parsed.data.subjectId,
      category: parsed.data.category,
      semester: parsed.data.semester,
      query: parsed.data.q,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });
    return NextResponse.json(catalog, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "تعذر تحميل المكتبة حاليًا. حاول مرة أخرى." }, { status: 500 });
  }
}
