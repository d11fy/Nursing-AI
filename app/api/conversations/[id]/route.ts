import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/db/server";
import { getSignedChatImageUrl } from "@/lib/storage";
import { getConversationSources } from "@/lib/library";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await createClient();
    const user = db.actor;
    if (!user || user.status !== "active") {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
    }

    const { data: conversation } = await db
      .from("conversations")
      .select("id, title, user_id, subject_id, created_at, updated_at")
      .eq("id", id)
      .single();

    if (!conversation || conversation.user_id !== user.user_id) {
      return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
    }

    const { data: rows } = await db
      .from("messages")
      .select("id, role, content, image_url, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });

    const messages = await Promise.all(
      (rows ?? [])
        .filter((m) => m.role !== "system")
        .map(async (m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          imageUrl: m.image_url ? await getSignedChatImageUrl(db, m.image_url).catch(() => null) : null,
          createdAt: m.created_at,
        }))
    );

    const activeSources = await getConversationSources(user.user_id, conversation.id);

    return NextResponse.json({
      conversation,
      messages,
      activeSources,
    });
  } catch (error) {
    console.error("GET /api/conversations/[id] error:", error);
    return NextResponse.json({ error: "تعذر تحميل المحادثة" }, { status: 500 });
  }
}

export async function PATCH(
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

    const body = await request.json().catch(() => ({}));
    const parsed = z.object({ title: z.string().trim().min(1).max(100) }).safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "العنوان غير صالح" }, { status: 400 });
    }

    const { error } = await db
      .from("conversations")
      .update({ title: parsed.data.title })
      .eq("id", id)
      .eq("user_id", user.user_id);

    if (error) {
      return NextResponse.json({ error: "تعذر تعديل عنوان المحادثة" }, { status: 500 });
    }

    return NextResponse.json({ success: true, title: parsed.data.title });
  } catch (error) {
    console.error("PATCH /api/conversations/[id] error:", error);
    return NextResponse.json({ error: "تعذر تعديل المحادثة" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await createClient();
    const user = db.actor;
    if (!user || user.status !== "active") {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
    }

    const { error } = await db
      .from("conversations")
      .delete()
      .eq("id", id)
      .eq("user_id", user.user_id);

    if (error) {
      return NextResponse.json({ error: "تعذر حذف المحادثة" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/conversations/[id] error:", error);
    return NextResponse.json({ error: "تعذر حذف المحادثة" }, { status: 500 });
  }
}
