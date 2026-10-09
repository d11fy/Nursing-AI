import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { loadConversationStudyView } from "@/lib/tutor/conversation-state";

/** Light-weight resync: the active book, the chapter position and any unanswered question (no messages). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient();
  const user = db.actor;
  if (!user || user.status !== "active") return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const { id } = await params;
  const owned = await db.from("conversations").select("id").eq("id", id).eq("user_id", user.user_id).maybeSingle();
  if (!owned.data) return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
  return NextResponse.json(await loadConversationStudyView(user.user_id, id), { headers: { "Cache-Control": "no-store" } });
}
