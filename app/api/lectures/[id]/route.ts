import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });

  const { data: lecture } = await db
    .from("lectures")
    .select("id, title, status, error_message, delete_after, contribution_status")
    .eq("id", id)
    .single();
  if (!lecture) return NextResponse.json({ error: "المحاضرة غير موجودة" }, { status: 404 });

  return NextResponse.json(lecture);
}
