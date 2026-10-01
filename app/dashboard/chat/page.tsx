import { ChatView } from "@/components/chat/chat-view";
import { forbidden } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { getSettings } from "@/lib/usage";
import { canStudentAccessSubject, getStudentSubjects, getSubjectById } from "@/lib/subjects";

export default async function NewChatPage({ searchParams }: PageProps<"/dashboard/chat">) {
  const profile = await requireProfile();
  const params = await searchParams;
  const subjectParam = params.subject;
  const subjectId = Array.isArray(subjectParam) ? subjectParam[0] : subjectParam;
  let subjectName: string | null = null;
  if (subjectId) {
    if (!await canStudentAccessSubject(profile.user_id, subjectId)) forbidden();
    subjectName = (await getSubjectById(subjectId))?.name_ar ?? null;
  }
  const [{ maxImageSizeMb }, { subjects }] = await Promise.all([
    getSettings(await createClient()),
    getStudentSubjects(profile.user_id),
  ]);

  return (
    <ChatView
      conversationId={null}
      initialMessages={[]}
      subjectId={subjectId ?? null}
      subjectName={subjectName}
      maxImageSizeMb={maxImageSizeMb}
      availableSubjects={subjects.map((subject) => ({ id: subject.id, name: subject.name_ar }))}
      showAITrace={profile.role === "admin"}
    />
  );
}
