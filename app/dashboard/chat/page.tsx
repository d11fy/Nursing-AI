import { ChatView } from "@/components/chat/chat-view";
import { forbidden } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { canStudentAccessSubject, getSubjectById } from "@/lib/subjects";

export default async function NewChatPage({ searchParams }: PageProps<"/dashboard/chat">) {
  const params = await searchParams;
  const subjectParam = params.subject;
  const subjectId = Array.isArray(subjectParam) ? subjectParam[0] : subjectParam;
  let subjectName: string | null = null;
  if (subjectId) {
    const profile = await requireProfile();
    if (!await canStudentAccessSubject(profile.user_id, subjectId)) forbidden();
    subjectName = (await getSubjectById(subjectId))?.name_ar ?? null;
  }

  return <ChatView conversationId={null} initialMessages={[]} subjectId={subjectId ?? null} subjectName={subjectName} />;
}
