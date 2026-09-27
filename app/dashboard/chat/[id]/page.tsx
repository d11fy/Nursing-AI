import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { getSignedChatImageUrl } from "@/lib/storage";
import { getSettings } from "@/lib/usage";
import { ChatView } from "@/components/chat/chat-view";
import type { ChatMessageData } from "@/components/chat/message-bubble";
import { canStudentAccessSubject, getSubjectById } from "@/lib/subjects";
import { forbidden } from "next/navigation";

export default async function ConversationPage({ params }: PageProps<"/dashboard/chat/[id]">) {
  const { id } = await params;
  const profile = await requireProfile();
  const db = await createClient();

  const { data: conversation } = await db
    .from("conversations")
    .select("id, user_id, subject_id")
    .eq("id", id)
    .single();

  if (!conversation || conversation.user_id !== profile.user_id) notFound();
  let subjectName: string | null = null;
  if (conversation.subject_id) {
    if (!await canStudentAccessSubject(profile.user_id, conversation.subject_id)) forbidden();
    subjectName = (await getSubjectById(conversation.subject_id))?.name_ar ?? null;
  }

  const { data: rows } = await db
    .from("messages")
    .select("id, role, content, image_url")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  const initialMessages: ChatMessageData[] = await Promise.all(
    (rows ?? [])
      .filter((m) => m.role !== "system")
      .map(async (m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        imageUrl: m.image_url ? await getSignedChatImageUrl(db, m.image_url).catch(() => null) : null,
      }))
  );

  const { maxImageSizeMb } = await getSettings(db);

  return (
    <ChatView
      key={conversation.id}
      conversationId={conversation.id}
      initialMessages={initialMessages}
      subjectId={conversation.subject_id}
      subjectName={subjectName}
      maxImageSizeMb={maxImageSizeMb}
    />
  );
}
