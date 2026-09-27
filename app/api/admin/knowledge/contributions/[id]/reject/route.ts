import { NextResponse } from "next/server";
import { getAdminProfileOrNull } from "@/lib/auth";
import { rejectContribution } from "@/lib/lectures/admin-review";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminProfileOrNull();
  if (!admin) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const { id } = await params;
  try {
    await rejectContribution(id, admin.user_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "تعذر تنفيذ العملية" }, { status: 400 });
  }
}
