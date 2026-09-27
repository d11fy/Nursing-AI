"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
}: {
  conversationId: string | null;
  initialMessages: ChatMessageData[];
  subjectId?: string | null;
  subjectName?: string | null;
  lectureId?: string | null;
  maxImageSizeMb?: number;
  containerClassName?: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessageData[]>(initialMessages);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const conversationIdRef = useRef(initialConversationId);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(text: string) {
    if (abortRef.current) return;
    const trimmed = text.trim();
    if (!trimmed && !pendingImage) return;
    const messageContent = trimmed || (pendingImage ? DEFAULT_IMAGE_PROMPT : trimmed);

    const userMessage: ChatMessageData = {
      id: localId(),
      role: "user",
      content: messageContent,
      imageUrl: pendingImage?.previewUrl ?? null,
    };
    const assistantMessage: ChatMessageData = { id: localId(), role: "assistant", content: "" };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    const imagePath = pendingImage?.path;
    setPendingImage(null);
    setIsGenerating(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          conversationId: conversationIdRef.current ?? undefined,
          content: messageContent,
          subjectId: subjectId ?? undefined,
          lectureId: lectureId ?? undefined,
          imagePath: imagePath ?? undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "صار خطأ أثناء تجهيز الإجابة، جرب مرة ثانية.");
        setMessages((prev) => prev.filter((m) => m.id !== assistantMessage.id));
        return;
      }

      await consumeChatResponse(res, {
        onConversationId: (id) => { conversationIdRef.current = id; },
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
    <div className={`flex flex-col ${containerClassName}`}>
      {!lectureId && subjectId && subjectName && <div className="border-b border-border bg-card px-4 py-2 text-sm"><span className="text-muted-foreground">المادة: </span><Link href={`/dashboard/subjects/${subjectId}`} className="font-medium text-blue-600 hover:underline">{subjectName}</Link></div>}
      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {showSuggestions ? (
          <div className="flex h-full items-center justify-center">
            <Suggestions onPick={(text) => send(text)} />
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {isGenerating && messages[messages.length - 1]?.content === "" && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="size-4 animate-spin" />
                جارٍ التفكير...
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-3xl">
        <Composer
          value={input}
          onChange={setInput}
          onSend={() => send(input)}
          onStop={stop}
          isGenerating={isGenerating}
          pendingImage={pendingImage}
          onImageChange={setPendingImage}
          maxImageSizeMb={maxImageSizeMb}
        />
      </div>
    </div>
  );
}
