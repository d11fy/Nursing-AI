import { ChatView } from "@/components/chat/chat-view";

export default async function NewChatPage({ searchParams }: PageProps<"/dashboard/chat">) {
  const params = await searchParams;
  const subjectParam = params.subject;
  const subjectId = Array.isArray(subjectParam) ? subjectParam[0] : subjectParam;

  return <ChatView conversationId={null} initialMessages={[]} subjectId={subjectId ?? null} />;
}
