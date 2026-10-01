"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MessageSquareText, BookOpen } from "lucide-react";
import Link from "next/link";
import { MessageBubble, type ChatMessageData } from "@/components/chat/message-bubble";
import { Suggestions } from "@/components/chat/suggestions";
import { Composer, type PendingImage } from "@/components/chat/composer";
import { consumeChatResponse } from "@/lib/chat/stream";

let localIdCounter = 0;
function localId() {
  localIdCounter += 1;
  return `local-${localIdCounter}`;
}

const DEFAULT_IMAGE_PROMPT =
  "اشرح محتوى هذه الصورة بشكل تعليمي لطالب تمريض، وحدد أهم النقاط التي يجب فهمها.";

export function ChatView({
  conversationId: initialConversationId,
  initialMessages,
  subjectId,
  subjectName,
  lectureId,
  maxImageSizeMb,
  containerClassName = "h-[calc(100vh-4rem)]",
  showAITrace = false,
}: {
  conversationId: string | null;
  initialMessages: ChatMessageData[];
  subjectId?: string | null;
  subjectName?: string | null;
  lectureId?: string | null;
  maxImageSizeMb?: number;
  containerClassName?: string;
  showAITrace?: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessageData[]>(initialMessages);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadConversationId,setUploadConversationId]=useState(initialConversationId);
  const [uploadSubjectId,setUploadSubjectId]=useState(subjectId);
  const conversationIdRef = useRef(initialConversationId);
  const activeSubjectRef=useRef(subjectId);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(text: string) {
    if (abortRef.current) return;
    const trimmed = text.trim();
    if (!trimmed && !pendingImage) return;
    const messageContent = trimmed || (pendingImage ? (pendingImage.kind==='file'?'ساعدني أدرس هذا الملف واشرح أهم أقسامه.':DEFAULT_IMAGE_PROMPT) : trimmed);

    const userMessage: ChatMessageData = {
      id: localId(),
      role: "user",
      content: messageContent,
      imageUrl: pendingImage?.previewUrl ?? null,
    };
    const assistantMessage: ChatMessageData = { id: localId(), role: "assistant", content: "" };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    const imagePath = pendingImage?.kind==='file'?undefined:pendingImage?.path;
    const attachmentId=pendingImage?.attachmentId;
    const uploadedLecture=pendingImage?.lectureId;
    if(pendingImage?.conversationId)conversationIdRef.current=pendingImage.conversationId;
    setPendingImage(null);
    setIsGenerating(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json",Accept:'text/event-stream' },
        signal: controller.signal,
        body: JSON.stringify({
          conversationId: conversationIdRef.current ?? undefined,
          content: messageContent,
          subjectId: activeSubjectRef.current ?? undefined,
          lectureId: uploadedLecture??lectureId ?? undefined,
          imagePath: imagePath ?? undefined,
          attachmentId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "صار خطأ أثناء تجهيز الإجابة، جرب مرة ثانية.");
        setMessages((prev) => prev.filter((m) => m.id !== assistantMessage.id));
        return;
      }

      activeSubjectRef.current=res.headers.get('X-Subject-Id')||activeSubjectRef.current;
      setUploadSubjectId(activeSubjectRef.current);
      await consumeChatResponse(res, {
        onMessageIds:(assistantId,userId)=>setMessages(prev=>prev.map(message=>message.id===assistantMessage.id?{...message,id:assistantId}:message.id===userMessage.id?{...message,id:userId}:message)),
        onConversationId: (id) => { conversationIdRef.current = id;setUploadConversationId(id); },
        onChunk: (chunk) => setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id ? { ...m, content: m.content + chunk } : m
          )
        ),
        onComplete: (id) => {
          if (id && id !== initialConversationId && !lectureId) {
            router.replace(`/dashboard/chat/${id}`, { scroll: false });
          }
        },
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error("صار خطأ أثناء تجهيز الإجابة، جرب مرة ثانية.");
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  const showSuggestions = messages.length === 0;

  return (
    <div className={`chat-layout flex min-h-0 min-w-0 flex-col ${containerClassName}`}>
      {!lectureId && (
        <div className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="icon-tile size-10 shrink-0"><MessageSquareText className="size-[18px]" /></span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground">المساعد الدراسي</p>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground"><span className="size-1.5 shrink-0 rounded-full bg-success" /> جاهز لمساعدتك في الدراسة</p>
            </div>
          </div>
          {subjectId && subjectName && <Link href={`/dashboard/subjects/${subjectId}`} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3 text-xs font-bold text-primary hover:bg-accent/70"><BookOpen className="size-3.5" /><span className="hidden sm:inline">{subjectName}</span></Link>}
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain bg-background px-3 py-5 sm:px-6 sm:py-8">
        {showSuggestions ? (
          <div className="flex h-full items-center justify-center">
            <Suggestions onPick={(text) => send(text)} />
          </div>
        ) : (
          <div className="mx-auto max-w-[920px] space-y-6 pb-6">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} showAITrace={showAITrace} />
            ))}
            {isGenerating && messages[messages.length - 1]?.content === "" && (
              <div role="status" aria-live="polite" className="flex min-h-10 items-center gap-3 px-2 text-xs text-muted-foreground sm:text-sm">
                <Loader2 className="size-4 animate-spin" />
                جارٍ تجهيز الشرح من سياق دراستك...
              </div>
            )}
          </div>
        )}
      </div>

      <div className="chat-composer-dock mx-auto w-full max-w-[920px] shrink-0">
        <Composer
          value={input}
          onChange={setInput}
          onSend={() => send(input)}
          onStop={stop}
          isGenerating={isGenerating}
          pendingImage={pendingImage}
          onImageChange={setPendingImage}
          maxImageSizeMb={maxImageSizeMb}
          conversationId={pendingImage?.conversationId??uploadConversationId}
          subjectId={uploadSubjectId}
        />
      </div>
    </div>
  );
}
