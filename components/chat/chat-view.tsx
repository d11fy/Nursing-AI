"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MessageSquareText, BookOpen, ListOrdered, RefreshCw } from "lucide-react";
import Link from "next/link";
import { MessageBubble, type ChatMessageData } from "@/components/chat/message-bubble";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import { Composer, type ChatSubjectOption, type PendingImage } from "@/components/chat/composer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { newRequestId, runChatTurn, type TurnPhase } from "@/lib/chat/turn";
import { webChatTransport } from "@/lib/chat/web-transport";
import { chatErrorMessage } from "@/lib/chat/errors";
import { recoverGeneration } from "@/lib/chat/recovery";
import type { ActiveLibrarySource } from "@/lib/library-types";
import type { ConversationStudyView } from "@/lib/tutor/conversation-state";

let localIdCounter = 0;
function localId() {
  localIdCounter += 1;
  return `local-${localIdCounter}`;
}

const DEFAULT_IMAGE_PROMPT =
  "اشرح محتوى هذه الصورة بشكل تعليمي لطالب تمريض، وحدد أهم النقاط التي يجب فهمها.";
/** No bytes (not even the server's 10-second keep-alives) for this long means the connection is dead. */
const STALL_MS = 35_000;

interface TurnInfo {
  requestId: string;
  content: string;
  userMessageId: string;
  assistantMessageId: string;
  imagePath?: string;
  attachmentId?: string;
  lectureId?: string;
  chapterIndex?: number;
}
interface Banner { message: string; kind: "failed" | "pending"; retryable: boolean }
/** The banner shown when a conversation opens with a question that has no saved answer. */
function initialBanner(view: ConversationStudyView | null): Banner | null {
  const pending = view?.pendingGeneration;
  if (!pending) return null;
  return pending.status === "pending" || pending.status === "streaming"
    ? { kind: "pending", retryable: false, message: chatErrorMessage("GENERATION_IN_PROGRESS") }
    : { kind: "failed", retryable: pending.retryable, message: "لم تكتمل إجابة آخر سؤال. يمكنك إعادة المحاولة بدون أن يُحتسب سؤال جديد." };
}
const phaseText = (phase: TurnPhase) =>
  phase === "recovering" ? chatErrorMessage("STREAM_INTERRUPTED")
    : phase === "offline" ? chatErrorMessage("NETWORK_OFFLINE")
      : phase === "waiting" ? chatErrorMessage("GENERATION_IN_PROGRESS") : "";

export function ChatView({
  conversationId: initialConversationId,
  initialMessages,
  subjectId,
  subjectName,
  lectureId,
  maxImageSizeMb,
  availableSubjects = [],
  containerClassName = "h-[calc(100dvh-4rem)]",
  showAITrace = false,
  initialActiveSources = [],
  initialStudy = null,
}: {
  conversationId: string | null;
  initialMessages: ChatMessageData[];
  subjectId?: string | null;
  subjectName?: string | null;
  lectureId?: string | null;
  maxImageSizeMb?: number;
  availableSubjects?: ChatSubjectOption[];
  containerClassName?: string;
  showAITrace?: boolean;
  initialActiveSources?: ActiveLibrarySource[];
  initialStudy?: ConversationStudyView | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessageData[]>(initialMessages);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [recoveryNote, setRecoveryNote] = useState("");
  const [banner, setBanner] = useState<Banner | null>(() => initialBanner(initialStudy));
  const [study, setStudy] = useState<ConversationStudyView | null>(initialStudy);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [uploadConversationId,setUploadConversationId]=useState(initialConversationId);
  const [uploadSubjectId,setUploadSubjectId]=useState(subjectId);
  const [activeSources,setActiveSources]=useState<ActiveLibrarySource[]>(initialActiveSources);
  const conversationIdRef = useRef(initialConversationId);
  const activeSubjectRef=useRef(subjectId);
  const initialSourcesHydratedRef=useRef(initialActiveSources.length === 0);
  const abortRef = useRef<AbortController | null>(null);
  const activeTurnRef = useRef<{ turn: TurnInfo; controller: AbortController; settledByResync: boolean } | null>(null);
  const lastTurnRef = useRef<TurnInfo | null>(null);
  const pendingWatchRef = useRef<AbortController | null>(null);
  useEffect(() => () => { abortRef.current?.abort(); pendingWatchRef.current?.abort(); }, []);

  const refreshStudy = useCallback(async () => {
    const id = conversationIdRef.current;
    if (!id) return;
    try {
      const response = await fetch(`/api/conversations/${id}/study`, { cache: "no-store" });
      if (response.ok) setStudy(await response.json());
    } catch { /* the book chip is optional */ }
  }, []);

  /** A question whose answer is not on screen yet (still generating, or interrupted): follow it on the server. */
  useEffect(() => {
    const pending = initialStudy?.pendingGeneration;
    if (!pending) return;
    const question = initialMessages.find((m) => m.id === pending.userMessageId) ?? [...initialMessages].reverse().find((m) => m.role === "user");
    if (question) lastTurnRef.current = { requestId: pending.requestId, content: question.content, userMessageId: question.id,
      assistantMessageId: `local-asst-${pending.requestId}`, lectureId: lectureId ?? undefined };
    if (pending.status !== "pending" && pending.status !== "streaming") return;
    const controller = new AbortController();
    pendingWatchRef.current = controller;
    void recoverGeneration({ requestId: pending.requestId, fetchStatus: (id) => webChatTransport.status(id, controller.signal), signal: controller.signal, maxWaitMs: 120_000 })
      .then((outcome) => {
        if (controller.signal.aborted) return;
        if (outcome.outcome === "completed") {
          setBanner(null);
          void fetch(`/api/conversations/${initialConversationId}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((data) => { if (data?.messages) setMessages(data.messages); });
          void refreshStudy();
        } else setBanner({ kind: outcome.outcome === "pending" ? "pending" : "failed", retryable: true,
          message: outcome.outcome === "failed" ? outcome.message : chatErrorMessage(outcome.outcome === "pending" ? "GENERATION_IN_PROGRESS" : "GENERATION_NOT_FOUND") });
      });
    return () => controller.abort();
  }, [initialStudy, initialMessages, initialConversationId, lectureId, refreshStudy]);

  async function runTurn(turn: TurnInfo) {
    const controller = new AbortController();
    abortRef.current = controller;
    activeTurnRef.current = { turn, controller, settledByResync: false };
    lastTurnRef.current = turn;
    pendingWatchRef.current?.abort();
    setBanner(null);
    setRecoveryNote("");
    setIsGenerating(true);
    const patch = (id: string, change: (m: ChatMessageData) => ChatMessageData) => setMessages((prev) => prev.map((m) => (m.id === id ? change(m) : m)));
    let assistantId = turn.assistantMessageId, userId = turn.userMessageId;
    try {
      if (!initialSourcesHydratedRef.current && activeSources.length) {
        for (const source of activeSources) {
          const attachResponse = await fetch("/api/library/sources", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversationId: conversationIdRef.current ?? undefined,
              documentId: source.id,
              subjectId: activeSubjectRef.current ?? source.subjectId ?? undefined,
            }),
          });
          const attached = await attachResponse.json();
          if (!attachResponse.ok) throw new Error(attached.error || "تعذر ربط مصدر المكتبة");
          conversationIdRef.current = attached.conversationId;
          setUploadConversationId(attached.conversationId);
        }
        initialSourcesHydratedRef.current = true;
      }
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m.id !== assistantId && m.id !== userId));
      setInput((current) => current || turn.content);
      toast.error(error instanceof Error ? error.message : "تعذر ربط مصدر المكتبة");
      abortRef.current = null; activeTurnRef.current = null; setIsGenerating(false);
      return;
    }
    const result = await runChatTurn({
      transport: webChatTransport,
      body: {
        requestId: turn.requestId,
        conversationId: conversationIdRef.current ?? undefined,
        content: turn.content,
        subjectId: activeSubjectRef.current ?? undefined,
        lectureId: turn.lectureId ?? lectureId ?? undefined,
        imagePath: turn.imagePath ?? undefined,
        attachmentId: turn.attachmentId,
        chapterIndex: turn.chapterIndex,
      },
      signal: controller.signal,
      stallMs: STALL_MS,
      callbacks: {
        onResponse: (response) => {
          const resolvedSubject = response.headers.get("X-Subject-Id");
          if (resolvedSubject) { activeSubjectRef.current = resolvedSubject; setUploadSubjectId(resolvedSubject); }
        },
        onConversationId: (id) => { conversationIdRef.current = id; setUploadConversationId(id); },
        onChunk: (chunk) => patch(assistantId, (m) => ({ ...m, content: m.content + chunk })),
        onMessageIds: (assistantServerId, userServerId) => {
          patch(assistantId, (m) => ({ ...m, id: assistantServerId }));
          patch(userId, (m) => ({ ...m, id: userServerId }));
          assistantId = assistantServerId; userId = userServerId;
          turn.assistantMessageId = assistantServerId; turn.userMessageId = userServerId;
        },
        // After a recovery the server's saved text is the truth, whatever part of it reached the browser.
        onFinal: (message) => patch(assistantId, (m) => ({ ...m, content: message.content })),
        onPhase: (phase) => setRecoveryNote(phaseText(phase)),
      },
    });
    const active = activeTurnRef.current;
    if (active?.controller === controller && active.settledByResync) return;
    if (abortRef.current === controller) abortRef.current = null;
    if (active?.controller === controller) activeTurnRef.current = null;
    setIsGenerating(false);
    setRecoveryNote("");
    if (result.outcome === "completed") {
      lastTurnRef.current = null;
      void refreshStudy();
      const id = result.conversationId ?? conversationIdRef.current;
      if (id && id !== initialConversationId && !lectureId) router.replace(`/dashboard/chat/${id}`, { scroll: false });
    } else if (result.outcome === "rejected") {
      setMessages((prev) => prev.filter((m) => m.id !== assistantId && m.id !== userId));
      setInput((current) => current || turn.content);
      lastTurnRef.current = null;
      toast.error(result.error);
    } else if (result.outcome === "failed") setBanner({ kind: "failed", retryable: result.retryable, message: result.message });
    else if (result.outcome === "pending") setBanner({ kind: "pending", retryable: true, message: result.message });
  }

  function submit(text: string, extras: { chapterIndex?: number; image?: PendingImage | null } = {}) {
    if (abortRef.current) return;
    const image = extras.image ?? null;
    const messageContent = text.trim() || (image ? (image.kind === "file" ? "ساعدني أدرس هذا الملف واشرح أهم أقسامه." : DEFAULT_IMAGE_PROMPT) : "");
    if (!messageContent) return;
    const userMessage: ChatMessageData = { id: localId(), role: "user", content: messageContent, imageUrl: image?.previewUrl ?? null };
    const assistantMessage: ChatMessageData = { id: localId(), role: "assistant", content: "" };
    if (image?.conversationId) conversationIdRef.current = image.conversationId;
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    void runTurn({
      requestId: newRequestId(), content: messageContent, userMessageId: userMessage.id, assistantMessageId: assistantMessage.id,
      imagePath: image?.kind === "file" ? undefined : image?.path, attachmentId: image?.attachmentId, lectureId: image?.lectureId, chapterIndex: extras.chapterIndex,
    });
  }

  function send(text: string) {
    if (abortRef.current) return;
    if (!text.trim() && !pendingImage) return;
    const image = pendingImage;
    setInput("");
    setPendingImage(null);
    submit(text, { image });
  }

  /** Same request id: the server replays a saved answer, waits for a running one, or re-runs a failed one without a second charge. */
  function retryTurn() {
    const turn = lastTurnRef.current;
    if (!turn || abortRef.current) return;
    setBanner(null);
    setMessages((prev) => {
      const withUser = prev.some((m) => m.id === turn.userMessageId) ? prev : [...prev, { id: turn.userMessageId, role: "user" as const, content: turn.content }];
      return withUser.some((m) => m.id === turn.assistantMessageId)
        ? withUser.map((m) => (m.id === turn.assistantMessageId ? { ...m, content: "" } : m))
        : [...withUser, { id: turn.assistantMessageId, role: "assistant" as const, content: "" }];
    });
    void runTurn(turn);
  }

  function stop() {
    const active = activeTurnRef.current;
    abortRef.current?.abort();
    // Only the Stop button cancels on the server; a dropped connection never does.
    if (active) void webChatTransport.cancel?.(active.turn.requestId);
  }

  function studyChapter(chapter: ConversationStudyView["outline"][number]) {
    setChaptersOpen(false);
    submit(`اشرحلي الفصل ${chapter.number ?? chapter.index}`, { chapterIndex: chapter.index });
  }

  /** Tab visible again / network back: trust the server's record of the answer, not the old connection. */
  const resync = useCallback(async () => {
    const active = activeTurnRef.current;
    if (!active) return;
    try {
      const snapshot = await webChatTransport.status(active.turn.requestId);
      if (snapshot.status === "completed" && snapshot.assistantMessage) {
        const saved = snapshot.assistantMessage;
        active.settledByResync = true;
        active.controller.abort();
        abortRef.current = null; activeTurnRef.current = null;
        setMessages((prev) => prev.map((m) => (m.id === active.turn.assistantMessageId ? { ...m, id: saved.id, content: saved.content } : m)));
        setIsGenerating(false); setRecoveryNote("");
        void refreshStudy();
      } else if (snapshot.status === "failed" || snapshot.status === "cancelled") {
        active.settledByResync = true;
        active.controller.abort();
        abortRef.current = null; activeTurnRef.current = null;
        setIsGenerating(false); setRecoveryNote("");
        setBanner({ kind: "failed", retryable: true, message: snapshot.error?.message ?? chatErrorMessage("INTERNAL") });
      }
    } catch { /* still offline */ }
  }, [refreshStudy]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void resync(); };
    const onOnline = () => void resync();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", onOnline); };
  }, [resync]);

  const showEmptyState = messages.length === 0;
  const chapterChip = study?.studyContext?.chapterIndex
    ? `الفصل ${study.studyContext.chapterNumber ?? study.studyContext.chapterIndex}${study.studyContext.totalParts && study.studyContext.totalParts > 1 && study.studyContext.part ? ` · الجزء ${study.studyContext.part}/${study.studyContext.totalParts}` : ""}`
    : null;

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
      {study?.activeDocument && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2 sm:px-6">
          <span className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-xl bg-accent px-3 text-xs font-bold text-primary">
            <BookOpen className="size-3.5 shrink-0" /><span dir="auto" className="truncate">{study.activeDocument.title}</span>
          </span>
          {chapterChip && <span className="inline-flex min-h-9 items-center rounded-xl border border-border px-3 text-xs font-bold">{chapterChip}</span>}
          {study.outline.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setChaptersOpen(true)} disabled={isGenerating}>
              <ListOrdered className="size-4" />الفصول
            </Button>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain bg-background px-3 py-5 sm:px-6 sm:py-8">
        {showEmptyState ? (
          <div className="flex h-full items-center justify-center">
            <ChatEmptyState />
          </div>
        ) : (
          <div className="mx-auto max-w-[920px] space-y-6 pb-6">
            {messages.filter((m) => m.role !== "assistant" || m.content !== "").map((m) => (
              <MessageBubble key={m.id} message={m} showAITrace={showAITrace} />
            ))}
            {isGenerating && (
              <div role="status" aria-live="polite" className="flex min-h-10 items-center gap-3 px-2 text-xs text-muted-foreground sm:text-sm">
                <Loader2 className="size-4 animate-spin" />
                {recoveryNote || (messages[messages.length - 1]?.content === "" ? "جارٍ تجهيز الشرح من سياق دراستك..." : "")}
              </div>
            )}
            {banner && (
              <div role={banner.kind === "failed" ? "alert" : "status"} className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p>{banner.message}</p>
                <div className="mt-2 flex gap-2">
                  {banner.retryable && (
                    <Button type="button" size="sm" variant="outline" onClick={retryTurn}>
                      <RefreshCw className="size-4" />{banner.kind === "pending" ? "تحقق مرة أخرى" : "إعادة المحاولة"}
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="ghost" onClick={() => setBanner(null)}>إغلاق</Button>
                </div>
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
          availableSubjects={availableSubjects}
          onSubjectChange={(nextSubjectId) => {
            activeSubjectRef.current = nextSubjectId;
            setUploadSubjectId(nextSubjectId);
          }}
          activeSources={activeSources}
          onActiveSourcesChange={setActiveSources}
          onConversationCreated={(id)=>{
            conversationIdRef.current=id;
            setUploadConversationId(id);
            router.replace(`/dashboard/chat/${id}`,{scroll:false});
          }}
          onFileReady={() => { void refreshStudy(); }}
        />
      </div>
      <Dialog open={chaptersOpen} onOpenChange={setChaptersOpen}>
        <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle dir="auto">{study?.activeDocument ? `الفصول — ${study.activeDocument.title}` : "الفصول"}</DialogTitle>
            <DialogDescription>
              {study?.activeDocument?.confidence === "low" ? "لم أتأكد من ترتيب الفصول بدقة؛ اختر الفصل الصحيح وسأبدأ منه." : "اختر فصلًا لأشرحه بالترتيب، أو اكتب «اشرحلي الفصل 4» في المحادثة."}
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {(study?.outline ?? []).map((chapter) => (
              <li key={chapter.index}>
                <Button type="button" variant={study?.studyContext?.chapterIndex === chapter.index ? "secondary" : "outline"} className="h-auto min-h-11 w-full justify-start whitespace-normal py-2 text-start" onClick={() => studyChapter(chapter)}>
                  <span dir="auto">{chapter.label}</span>
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
