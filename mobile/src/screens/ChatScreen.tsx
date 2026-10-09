import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Send,
  Image as ImageIcon,
  Camera,
  Paperclip,
  History,
  Sparkles,
  X,
  FileText,
  StopCircle,
  BookOpen,
  Copy,
  ThumbsUp,
  ThumbsDown,
  ListOrdered,
  RefreshCw,
} from "lucide-react";
import { useNavigation } from "../context/NavigationContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BottomSheet } from "../components/common/BottomSheet";
import { LibraryScreen } from "./LibraryScreen";
import {
  type ActiveLibrarySource,
  type LibraryResource,
} from "../config/library";
import { ChatFileError, waitForChatFile, type ChatFileUpload } from "../../../lib/chat/attachments";
import { newRequestId, runChatTurn, type TurnPhase } from "../../../lib/chat/turn";
import { recoverGeneration } from "../../../lib/chat/recovery";
import { chatErrorMessage } from "../../../lib/chat/errors";
import { resolveOfficialUrl, chatTransport } from "../services/api";
import { apiFetch, apiUpload } from "../services/api";
import { subscribeAppResume } from "../services/capacitor";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string | null;
}

interface PendingAttachment {
  type: "image" | "file";
  file: File;
  previewUrl?: string;
  path?: string;
  attachmentId?: string;
  lectureId?: string;
}

/** What the server remembers about this conversation: the active book, the chapter position, the unanswered question. */
interface StudyView {
  activeDocument: { id: string; title: string; kind: "private" | "library"; chapterCount: number; confidence: string } | null;
  studyContext: { chapterIndex: number | null; chapterNumber: number | null; chapterTitle: string | null; part: number | null; totalParts: number | null } | null;
  outline: Array<{ index: number; number: number | null; title: string; label: string; sections: number }>;
  pendingGeneration: { requestId: string; status: "pending" | "streaming" | "failed" | "cancelled"; retryable: boolean; userMessageId: string | null } | null;
}

/** One question and everything needed to send it again with the SAME request id (never a second answer or charge). */
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

interface Banner {
  message: string;
  kind: "failed" | "pending";
  retryable: boolean;
}

/** No bytes (not even the server's 10-second keep-alives) for this long means the connection is dead. */
const STALL_MS = 35_000;

const phaseText = (phase: TurnPhase) =>
  phase === "recovering"
    ? chatErrorMessage("STREAM_INTERRUPTED")
    : phase === "offline"
      ? chatErrorMessage("NETWORK_OFFLINE")
      : phase === "waiting"
        ? chatErrorMessage("GENERATION_IN_PROGRESS")
        : "";

export function ChatScreen({
  conversationId: initialConversationId,
  subjectId: initialSubjectId,
  subjectName: initialSubjectName,
  lectureId: initialLectureId,
}: {
  conversationId?: string | null;
  subjectId?: string | null;
  subjectName?: string | null;
  lectureId?: string | null;
}) {
  const { navigate, showToast } = useNavigation();

  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId || null,
  );
  const [subjectId, setSubjectId] = useState<string | null>(
    initialSubjectId || null,
  );
  const [subjectName, setSubjectName] = useState<string | null>(
    initialSubjectName || null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [recoveryNote, setRecoveryNote] = useState("");
  const [banner, setBanner] = useState<Banner | null>(null);
  const [study, setStudy] = useState<StudyView | null>(null);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [fileFailure, setFileFailure] = useState<{ lectureId: string; conversationId: string; message: string; file: File } | null>(null);
  const [pendingAttachment, setPendingAttachment] =
    useState<PendingAttachment | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [error, setError] = useState("");
  const [attachmentStatus, setAttachmentStatus] = useState("");
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);
  const [pickerSubject, setPickerSubject] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [activeSources, setActiveSources] = useState<ActiveLibrarySource[]>([]);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const previewUrlsRef = useRef(new Set<string>());
  const [availableSubjects, setAvailableSubjects] = useState<
    Array<{ id: string; name_ar: string }>
  >([]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  // Refs always hold the latest values for callbacks that outlive a render (stream handlers, resume listeners).
  const conversationIdRef = useRef<string | null>(conversationId);
  const subjectIdRef = useRef<string | null>(subjectId);
  const activeTurnRef = useRef<{ turn: TurnInfo; controller: AbortController; settledByResync: boolean } | null>(null);
  const lastTurnRef = useRef<TurnInfo | null>(null);
  const pendingWatchRef = useRef<AbortController | null>(null);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  useEffect(() => {
    subjectIdRef.current = subjectId;
  }, [subjectId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
      uploadControllerRef.current?.abort();
      pendingWatchRef.current?.abort();
      for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    },
    [],
  );

  // Load subjects for selector
  useEffect(() => {
    apiFetch("/api/subjects")
      .then((res) => {
        if (res.subjects) setAvailableSubjects(res.subjects);
      })
      .catch(() => {});
  }, []);

  const refreshStudy = useCallback(async () => {
    const cid = conversationIdRef.current;
    if (!cid) return;
    try {
      setStudy(await apiFetch<StudyView>(`/api/conversations/${cid}/study`));
    } catch {
      /* the chip row is optional; the chat keeps working without it */
    }
  }, []);

  /** A question whose answer is not on screen: still generating on the server, or interrupted and retryable. */
  const adoptPending = useCallback((view: StudyView, loaded: Message[]) => {
    const pending = view.pendingGeneration;
    pendingWatchRef.current?.abort();
    if (!pending) {
      setBanner(null);
      return;
    }
    const question =
      loaded.find((m) => m.id === pending.userMessageId) ??
      [...loaded].reverse().find((m) => m.role === "user");
    if (question) {
      lastTurnRef.current = {
        requestId: pending.requestId,
        content: question.content,
        userMessageId: question.id,
        assistantMessageId: `local-asst-${pending.requestId}`,
        lectureId: initialLectureId || undefined,
      };
    }
    if (pending.status === "pending" || pending.status === "streaming") {
      setBanner({ kind: "pending", retryable: false, message: chatErrorMessage("GENERATION_IN_PROGRESS") });
      const controller = new AbortController();
      pendingWatchRef.current = controller;
      void recoverGeneration({
        requestId: pending.requestId,
        fetchStatus: (id) => chatTransport.status(id, controller.signal),
        signal: controller.signal,
        maxWaitMs: 120_000,
      }).then(async (outcome) => {
        if (controller.signal.aborted) return;
        if (outcome.outcome === "completed") {
          const cid = conversationIdRef.current;
          if (cid) {
            const res = await apiFetch(`/api/conversations/${cid}`).catch(() => null);
            if (res?.messages) setMessages(res.messages);
          }
          setBanner(null);
          void refreshStudy();
        } else if (outcome.outcome === "failed" || outcome.outcome === "not_found" || outcome.outcome === "offline")
          setBanner({ kind: "failed", retryable: true, message: outcome.outcome === "failed" ? outcome.message : chatErrorMessage("GENERATION_NOT_FOUND") });
        else setBanner({ kind: "pending", retryable: true, message: chatErrorMessage("GENERATION_IN_PROGRESS") });
      });
    } else {
      setBanner({ kind: "failed", retryable: pending.retryable, message: "لم تكتمل إجابة آخر سؤال. يمكنك إعادة المحاولة بدون أن يُحتسب سؤال جديد." });
    }
  }, [initialLectureId, refreshStudy]);

  // Cancel stale requests when the student changes conversations.
  useEffect(() => {
    const controller = new AbortController();
    if (initialConversationId) {
      setLoadingConversation(true);
      apiFetch(`/api/conversations/${initialConversationId}`, {
        signal: controller.signal,
      })
        .then((res) => {
          setMessages(res.messages || []);
          setConversationId(res.conversation.id);
          conversationIdRef.current = res.conversation.id;
          setSubjectId(res.conversation.subject_id);
          setActiveSources(res.activeSources || []);
          const view: StudyView = {
            activeDocument: res.activeDocument ?? null,
            studyContext: res.studyContext ?? null,
            outline: res.outline ?? [],
            pendingGeneration: res.pendingGeneration ?? null,
          };
          setStudy(view);
          adoptPending(view, res.messages || []);
        })
        .catch((err) => {
          if (!controller.signal.aborted) setError(err.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingConversation(false);
        });
    }
    return () => controller.abort();
  }, [initialConversationId, adoptPending]);

  const handleStartNewChat = () => {
    abortControllerRef.current?.abort();
    uploadControllerRef.current?.abort();
    pendingWatchRef.current?.abort();
    activeTurnRef.current = null;
    lastTurnRef.current = null;
    setIsGenerating(false);
    setUploadingAttachment(false);
    setConversationId(null);
    conversationIdRef.current = null;
    setMessages([]);
    setInput("");
    setPendingAttachment(null);
    setActiveSources([]);
    setStudy(null);
    setBanner(null);
    setFileFailure(null);
    setRecoveryNote("");
    setError("");
  };
  const openDocumentPicker = () => {
    if (subjectId) {
      docInputRef.current?.click();
      return;
    }
    if (availableSubjects.length === 1) {
      setSubjectId(availableSubjects[0].id);
      setPickerSubject(availableSubjects[0].id);
      setSubjectPickerOpen(true);
      return;
    }
    if (!availableSubjects.length) {
      showToast("لا توجد مادة متاحة لربط الملف بها");
      return;
    }
    setSubjectPickerOpen(true);
  };
  const attachSource = async (resource: LibraryResource) => {
    const res = await apiFetch("/api/library/sources", {
      method: "POST",
      body: JSON.stringify({
        conversationId,
        documentId: resource.id,
        subjectId: subjectId || resource.subjectId,
      }),
    });
    setConversationId(res.conversationId);
    conversationIdRef.current = res.conversationId;
    setSubjectId((id) => id || resource.subjectId);
    setActiveSources((prev) => [
      ...prev.filter((item) => item.id !== res.source.id),
      res.source,
    ]);
    setLibraryOpen(false);
    showToast("تم إرفاق المصدر للمحادثة");
    void refreshStudy();
  };
  const removeSource = async (id: string) => {
    if (!conversationId || isGenerating) return;
    try {
      await apiFetch("/api/library/sources", {
        method: "DELETE",
        body: JSON.stringify({ conversationId, documentId: id }),
      });
      setActiveSources((prev) => prev.filter((item) => item.id !== id));
      void refreshStudy();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "تعذر إزالة المصدر");
    }
  };
  const feedback = async (messageId: string, isPositive: boolean) => {
    try {
      await apiFetch("/api/feedback", {
        method: "POST",
        body: JSON.stringify({ messageId, isPositive }),
      });
      showToast("شكرًا لتقييمك");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "تعذر إرسال التقييم");
    }
  };

  // Image Selection (Gallery)
  const handleImageSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (
      !["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(
        file.type,
      )
    ) {
      showToast("استخدم صورة JPG أو PNG أو WEBP");
      return;
    }
    setError("");
    setUploadingAttachment(true);
    try {
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);
      const form = new FormData();
      form.append("file", file);
      const res = await apiUpload("/api/upload", form);
      setPendingAttachment({
        type: "image",
        file,
        previewUrl,
        path: res.path,
      });
    } catch (err: any) {
      setError(err.message || "فشل رفع الصورة");
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Camera Capture
  const handleCameraSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (
      !["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(
        file.type,
      )
    ) {
      showToast("استخدم صورة JPG أو PNG أو WEBP");
      return;
    }
    setError("");
    setUploadingAttachment(true);
    try {
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);
      const form = new FormData();
      form.append("file", file);
      const res = await apiUpload("/api/upload", form);
      setPendingAttachment({
        type: "image",
        file,
        previewUrl,
        path: res.path,
      });
    } catch (err: any) {
      setError(err.message || "فشل التقاط الصورة");
    } finally {
      setUploadingAttachment(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  /** uploading -> processing -> ready | failed. The file cannot be used with the AI before it is ready. */
  const awaitFileReady = async (uploaded: ChatFileUpload, file: File, controller: AbortController) => {
    setConversationId(uploaded.conversationId);
    conversationIdRef.current = uploaded.conversationId;
    try {
      const ready = await waitForChatFile(
        uploaded,
        (cid, lectureId) =>
          apiFetch(
            `/api/chat/files?${new URLSearchParams({ conversationId: cid, lectureId })}`,
            { signal: controller.signal },
          ),
        {
          signal: controller.signal,
          onStatus: (_status, phase) =>
            setAttachmentStatus(
              phase === "uploading"
                ? "جارٍ رفع الملف..."
                : "جارٍ تجهيز الملف للدراسة... يمكنك إلغاء الانتظار",
            ),
        },
      );
      setFileFailure(null);
      setPendingAttachment({
        type: "file",
        file,
        attachmentId: ready.attachmentId,
        lectureId: ready.lectureId,
      });
      showToast(
        ready.chapterCount && ready.chapterCount > 1
          ? `الملف جاهز للدراسة (${ready.chapterCount} فصول)`
          : "الملف جاهز للدراسة",
      );
      void refreshStudy();
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof ChatFileError && err.retryable && err.code !== "FILE_PROCESSING")
        setFileFailure({ lectureId: err.lectureId, conversationId: uploaded.conversationId, message: err.message, file });
      else setError(err instanceof Error ? err.message : "فشل رفع الملف");
    }
  };

  // Document File Selection
  const handleDocSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!subjectId) {
      setSubjectPickerOpen(true);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast("الحد الأقصى لملف المحادثة 10MB");
      return;
    }
    if (!/\.(pdf|docx|pptx|txt)$/i.test(file.name)) {
      showToast("استخدم PDF أو DOCX أو PPTX أو TXT");
      return;
    }
    setUploadingAttachment(true);
    setError("");
    setFileFailure(null);
    setAttachmentStatus("جارٍ رفع الملف...");
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    try {
      const form = new FormData();
      form.append("file", file);
      if (conversationId) form.append("conversationId", conversationId);
      form.append("subjectId", subjectId);
      const uploaded = await apiUpload(
        "/api/chat/files",
        form,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      await awaitFileReady(uploaded, file, controller);
    } catch (err) {
      if (!controller.signal.aborted)
        setError(err instanceof Error ? err.message : "فشل رفع الملف");
    } finally {
      if (uploadControllerRef.current === controller) {
        setUploadingAttachment(false);
        setAttachmentStatus("");
        uploadControllerRef.current = null;
      }
    }
  };

  /** "إعادة المحاولة" after a failed preparation: queue the same file again and keep waiting for ready. */
  const retryFile = async () => {
    const failure = fileFailure;
    if (!failure) return;
    setFileFailure(null);
    setUploadingAttachment(true);
    setError("");
    setAttachmentStatus("جارٍ تجهيز الملف للدراسة... يمكنك إلغاء الانتظار");
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    try {
      await apiFetch(`/api/lectures/${failure.lectureId}/retry`, { method: "POST", signal: controller.signal });
      await awaitFileReady(
        { conversationId: failure.conversationId, lectureId: failure.lectureId, status: "processing" },
        failure.file,
        controller,
      );
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "تعذر تجهيز الملف");
    } finally {
      if (uploadControllerRef.current === controller) {
        setUploadingAttachment(false);
        setAttachmentStatus("");
        uploadControllerRef.current = null;
      }
    }
  };

  /** Runs one question through the shared engine: stream, recover from drops, never duplicate. */
  const runTurn = async (turn: TurnInfo) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    activeTurnRef.current = { turn, controller, settledByResync: false };
    lastTurnRef.current = turn;
    pendingWatchRef.current?.abort();
    setBanner(null);
    setError("");
    setRecoveryNote("");
    setIsGenerating(true);
    const patch = (id: string, change: (m: Message) => Message) =>
      setMessages((prev) => prev.map((m) => (m.id === id ? change(m) : m)));
    let assistantId = turn.assistantMessageId;
    let userId = turn.userMessageId;
    const result = await runChatTurn({
      transport: chatTransport,
      body: {
        requestId: turn.requestId,
        conversationId: conversationIdRef.current || undefined,
        content: turn.content,
        subjectId: subjectIdRef.current || undefined,
        lectureId: turn.lectureId || initialLectureId || undefined,
        imagePath: turn.imagePath || undefined,
        attachmentId: turn.attachmentId || undefined,
        chapterIndex: turn.chapterIndex || undefined,
      },
      signal: controller.signal,
      stallMs: STALL_MS,
      callbacks: {
        onConversationId: (id) => {
          conversationIdRef.current = id;
          setConversationId(id);
        },
        onChunk: (chunk) => patch(assistantId, (m) => ({ ...m, content: m.content + chunk })),
        onMessageIds: (assistantServerId, userServerId) => {
          patch(assistantId, (m) => ({ ...m, id: assistantServerId }));
          patch(userId, (m) => ({ ...m, id: userServerId }));
          assistantId = assistantServerId;
          userId = userServerId;
          turn.assistantMessageId = assistantServerId;
          turn.userMessageId = userServerId;
        },
        // After a recovery the server's saved text is the truth, whatever part of it reached the phone.
        onFinal: (message) => patch(assistantId, (m) => ({ ...m, content: message.content })),
        onPhase: (phase) => setRecoveryNote(phaseText(phase)),
      },
    });
    const active = activeTurnRef.current;
    if (active?.controller === controller && active.settledByResync) return; // the resume check already handled it
    if (abortControllerRef.current === controller) abortControllerRef.current = null;
    if (active?.controller === controller) activeTurnRef.current = null;
    setIsGenerating(false);
    setRecoveryNote("");
    if (result.outcome === "completed") {
      lastTurnRef.current = null;
      void refreshStudy();
    } else if (result.outcome === "rejected") {
      // Nothing was generated or charged: take the optimistic bubbles back and let the student fix the cause.
      setMessages((prev) => prev.filter((m) => m.id !== assistantId && m.id !== userId));
      setInput((current) => current || turn.content);
      lastTurnRef.current = null;
      const failedFile = result.data as { phase?: string; lectureId?: string; retryable?: boolean };
      if (failedFile.phase === "failed" && failedFile.lectureId && failedFile.retryable && conversationIdRef.current)
        setFileFailure({ lectureId: failedFile.lectureId, conversationId: conversationIdRef.current, message: result.error, file: new File([], study?.activeDocument?.title ?? "الملف") });
      else setError(result.error);
    } else if (result.outcome === "failed") {
      setBanner({ kind: "failed", retryable: result.retryable, message: result.message });
    } else if (result.outcome === "pending") {
      setBanner({ kind: "pending", retryable: true, message: result.message });
    }
  };

  const submit = (text: string, attachment: PendingAttachment | null, extras: { chapterIndex?: number } = {}) => {
    const requestId = newRequestId();
    const turn: TurnInfo = {
      requestId,
      content: text,
      userMessageId: `local-user-${requestId}`,
      assistantMessageId: `local-asst-${requestId}`,
      imagePath: attachment?.path,
      attachmentId: attachment?.attachmentId,
      lectureId: attachment?.lectureId,
      chapterIndex: extras.chapterIndex,
    };
    setMessages((prev) => [
      ...prev,
      { id: turn.userMessageId, role: "user", content: text, imageUrl: attachment?.previewUrl || null },
      { id: turn.assistantMessageId, role: "assistant", content: "" },
    ]);
    void runTurn(turn);
  };

  const handleSend = () => {
    const text = input.trim();
    if (
      isGenerating ||
      uploadingAttachment ||
      loadingConversation ||
      abortControllerRef.current ||
      (!text && !pendingAttachment)
    )
      return;
    setError("");

    const currentText =
      text ||
      (pendingAttachment?.type === "image"
        ? "اشرح محتوى هذه الصورة بشكل سريري تعليمي لطالب تمريض."
        : "لخص أهم محتويات هذا الملف واشرحها.");
    const attachment = pendingAttachment;
    setInput("");
    setPendingAttachment(null);
    submit(currentText, attachment);
  };

  /** Chapter list: tapping a chapter is the same as typing "اشرحلي الفصل N", and works even when the structure is uncertain. */
  const studyChapter = (chapter: StudyView["outline"][number]) => {
    setChaptersOpen(false);
    if (isGenerating || uploadingAttachment || loadingConversation) return;
    submit(`اشرحلي الفصل ${chapter.number ?? chapter.index}`, null, { chapterIndex: chapter.index });
  };

  /** Same request id as before: the server replays a saved answer, waits for a running one, or re-runs a failed one for free. */
  const retryTurn = () => {
    const turn = lastTurnRef.current;
    if (!turn || isGenerating) return;
    setBanner(null);
    setMessages((prev) => {
      const withUser = prev.some((m) => m.id === turn.userMessageId) ? prev : [...prev, { id: turn.userMessageId, role: "user" as const, content: turn.content }];
      const base = withUser.some((m) => m.id === turn.assistantMessageId)
        ? withUser.map((m) => (m.id === turn.assistantMessageId ? { ...m, content: "" } : m))
        : [...withUser, { id: turn.assistantMessageId, role: "assistant" as const, content: "" }];
      return base;
    });
    void runTurn(turn);
  };

  const handleStop = () => {
    const active = activeTurnRef.current;
    abortControllerRef.current?.abort();
    // Only the Stop button cancels on the server; a dropped connection never does.
    if (active) void chatTransport.cancel?.(active.turn.requestId);
    setIsGenerating(false);
    setRecoveryNote("");
  };

  /** App returned to the foreground / screen unlocked / network changed: trust the server, not the old connection. */
  const resync = useCallback(async () => {
    const active = activeTurnRef.current;
    if (active) {
      try {
        const snapshot = await chatTransport.status(active.turn.requestId);
        if (snapshot.status === "completed" && snapshot.assistantMessage) {
          const saved = snapshot.assistantMessage;
          active.settledByResync = true;
          active.controller.abort();
          abortControllerRef.current = null;
          activeTurnRef.current = null;
          setMessages((prev) => prev.map((m) => (m.id === active.turn.assistantMessageId ? { ...m, id: saved.id, content: saved.content } : m)));
          setIsGenerating(false);
          setRecoveryNote("");
          void refreshStudy();
        } else if (snapshot.status === "failed" || snapshot.status === "cancelled") {
          active.settledByResync = true;
          active.controller.abort();
          abortControllerRef.current = null;
          activeTurnRef.current = null;
          setIsGenerating(false);
          setRecoveryNote("");
          setBanner({ kind: "failed", retryable: true, message: snapshot.error?.message ?? chatErrorMessage("INTERNAL") });
        }
      } catch {
        /* still offline: the stall timer and recovery loop keep working */
      }
      return;
    }
    const cid = conversationIdRef.current;
    if (!cid || uploadControllerRef.current) return;
    try {
      const res = await apiFetch(`/api/conversations/${cid}`);
      if (activeTurnRef.current) return;
      setMessages(res.messages || []);
      setActiveSources(res.activeSources || []);
      const view: StudyView = {
        activeDocument: res.activeDocument ?? null,
        studyContext: res.studyContext ?? null,
        outline: res.outline ?? [],
        pendingGeneration: res.pendingGeneration ?? null,
      };
      setStudy(view);
      adoptPending(view, res.messages || []);
    } catch {
      /* offline: nothing to resync yet */
    }
  }, [adoptPending, refreshStudy]);
  useEffect(() => subscribeAppResume(() => void resync()), [resync]);

  const chapterChip = study?.studyContext?.chapterIndex
    ? `الفصل ${study.studyContext.chapterNumber ?? study.studyContext.chapterIndex}${
        study.studyContext.totalParts && study.studyContext.totalParts > 1 && study.studyContext.part
          ? ` · الجزء ${study.studyContext.part}/${study.studyContext.totalParts}`
          : ""
      }`
    : null;

  return (
    <div className="chat-viewport flex min-h-0 flex-col">
      {/* Top Chat Action Bar */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-800">
        {/* Subject Pill Dropdown */}
        <select
          disabled={
            isGenerating || uploadingAttachment || Boolean(conversationId)
          }
          aria-label="المادة الدراسية"
          title={subjectName || "اختر المادة"}
          value={subjectId || ""}
          onChange={(e) => {
            const id = e.target.value || null;
            setSubjectId(id);
            const found = availableSubjects.find((s) => s.id === id);
            setSubjectName(found?.name_ar || null);
          }}
          className="h-8 max-w-[200px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 text-[11px] font-bold text-slate-700 dark:text-slate-300 outline-hidden truncate"
        >
          <option value="">كافة المواد (المعلم العام)</option>
          {availableSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name_ar}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          <button
            disabled={uploadingAttachment || loadingConversation}
            onClick={handleStartNewChat}
            className="flex items-center gap-1 px-2.5 h-8 rounded-xl bg-teal-50 dark:bg-slate-800 text-primary text-[11px] font-bold active:scale-95 transition-all"
          >
            <Sparkles className="size-3" />
            <span>محادثة جديدة</span>
          </button>
          <button
            onClick={() => navigate("chat-history")}
            className="flex size-8 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 active:scale-95"
            aria-label="السجل"
          >
            <History className="size-4" />
          </button>
        </div>
      </div>

      {/* The book this conversation studies, kept on the server (survives closing the app) */}
      {study?.activeDocument && (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto no-scrollbar py-2">
          <span className="chip max-w-[220px]">
            <BookOpen className="size-4 shrink-0" />
            <span dir="auto" className="truncate">{study.activeDocument.title}</span>
          </span>
          {chapterChip && <span className="chip shrink-0">{chapterChip}</span>}
          {study.outline.length > 0 && (
            <button className="chip min-h-11 shrink-0" onClick={() => setChaptersOpen(true)} disabled={isGenerating}>
              <ListOrdered className="size-4" />
              الفصول
            </button>
          )}
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="min-h-0 flex-1 overflow-y-auto py-3 space-y-4 px-1">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-4">
            <div className="flex size-14 items-center justify-center rounded-3xl bg-teal-50 text-primary dark:bg-slate-800 shadow-xs">
              <Sparkles className="size-7" />
            </div>
            <div className="space-y-1 max-w-xs">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                أنا معلمك التمريضي الذكي
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                اسألني عن الحالات السريرية، جرعات الأدوية، فسيولوجيا الأمراض، أو
                أرفق صورة وملفًا للشرح.
              </p>
            </div>

            {/* Prompt Suggestions */}
            <div className="grid grid-cols-1 gap-2 w-full max-w-xs pt-2">
              {[
                "ما هي أولويات التمريض في حالة الصدمة الإنتانية؟",
                "اشرح آلية عمل أدوية ACE Inhibitors ببساطة.",
                "كيف أفرّق بين أنواع المحاليل الوريدية؟",
              ].map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => setInput(suggestion)}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs text-start hover:border-primary active:scale-98 transition-all"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.filter((m) => m.role !== "assistant" || m.content).map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.role === "user" ? "items-start" : "items-end"}`}
            >
              <div
                className={`max-w-[88%] rounded-3xl p-3.5 text-xs leading-relaxed selectable-text ${
                  m.role === "user"
                    ? "bg-primary text-white rounded-br-xs shadow-xs"
                    : "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-bl-xs shadow-xs"
                }`}
              >
                {/* Image if attached */}
                {m.imageUrl && (
                  <img
                    src={
                      m.imageUrl.startsWith("blob:")
                        ? m.imageUrl
                        : resolveOfficialUrl(m.imageUrl)
                    }
                    alt="مرفق"
                    className="max-h-56 w-full rounded-2xl object-cover mb-2"
                  />
                )}
                {/* Message text formatted with line breaks */}
                {m.role === "assistant" ? (
                  <div className="markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {m.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap break-words">
                    {m.content}
                  </div>
                )}
                {m.role === "assistant" && m.content && (
                  <div className="flex gap-1 mt-2 border-t border-slate-100 pt-1">
                    <button
                      aria-label="نسخ الإجابة"
                      className="min-h-11 min-w-11"
                      onClick={() =>
                        navigator.clipboard
                          .writeText(m.content)
                          .then(() => showToast("تم النسخ"))
                          .catch(() => showToast("يمكنك تحديد النص ونسخه"))
                      }
                    >
                      <Copy className="size-4 mx-auto" />
                    </button>
                    {!m.id.startsWith("local-") && (
                      <>
                        <button
                          aria-label="إجابة مفيدة"
                          className="min-h-11 min-w-11"
                          onClick={() => feedback(m.id, true)}
                        >
                          <ThumbsUp className="size-4 mx-auto" />
                        </button>
                        <button
                          aria-label="إجابة غير مفيدة"
                          className="min-h-11 min-w-11"
                          onClick={() => feedback(m.id, false)}
                        >
                          <ThumbsDown className="size-4 mx-auto" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {isGenerating && (
          <div role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-primary font-bold animate-pulse px-2">
            <Sparkles className="size-3.5" />
            <span>{recoveryNote || "جارٍ التفكير وصياغة الشرح..."}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {banner && (
        <div
          role={banner.kind === "failed" ? "alert" : "status"}
          className="shrink-0 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 mb-2"
        >
          <p>{banner.message}</p>
          <div className="mt-1 flex gap-2">
            {banner.retryable && (
              <button className="min-h-11 inline-flex items-center gap-1 font-bold underline" onClick={retryTurn}>
                <RefreshCw className="size-4" aria-hidden />
                {banner.kind === "pending" ? "تحقق مرة أخرى" : "إعادة المحاولة"}
              </button>
            )}
            <button className="min-h-11 underline" onClick={() => setBanner(null)}>
              إغلاق
            </button>
          </div>
        </div>
      )}
      {fileFailure && (
        <div role="alert" className="shrink-0 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-2">
          <p>{fileFailure.message}</p>
          <div className="mt-1 flex gap-2">
            <button className="min-h-11 inline-flex items-center gap-1 font-bold underline" onClick={() => void retryFile()}>
              <RefreshCw className="size-4" aria-hidden />
              إعادة المحاولة
            </button>
            <button className="min-h-11 underline" onClick={() => setFileFailure(null)}>
              إغلاق
            </button>
          </div>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="shrink-0 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-2"
        >
          <p>{error}</p>
          <button className="min-h-11 underline" onClick={() => setError("")}>
            إغلاق
          </button>
        </div>
      )}
      {attachmentStatus && (
        <div
          role="status"
          className="shrink-0 flex items-center justify-between rounded-xl bg-teal-50 p-2 text-sm text-primary"
        >
          <span>{attachmentStatus}</span>
          <button
            className="min-h-11 px-3"
            onClick={() => uploadControllerRef.current?.abort()}
          >
            إلغاء
          </button>
        </div>
      )}
      {activeSources.length > 0 && (
        <div className="flex shrink-0 gap-2 overflow-x-auto no-scrollbar py-2">
          {activeSources.map((source) => (
            <span key={source.id} className="chip max-w-[240px]">
              <BookOpen className="size-4 shrink-0" />
              <span dir="auto" className="truncate">{source.title}</span>
              <button
                disabled={isGenerating}
                aria-label={`إزالة ${source.title}`}
                className="min-h-11"
                onClick={() => removeSource(source.id)}
              >
                <X className="size-4" />
              </button>
            </span>
          ))}
        </div>
      )}
      {/* Pending Attachment Preview */}
      {pendingAttachment && (
        <div className="flex items-center justify-between p-2.5 rounded-2xl bg-teal-50 dark:bg-slate-800 border border-teal-200 dark:border-slate-700 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            {pendingAttachment.previewUrl ? (
              <img
                src={pendingAttachment.previewUrl}
                alt="معاينة"
                className="size-10 rounded-xl object-cover"
              />
            ) : (
              <FileText className="size-6 text-primary" />
            )}
            <span dir="auto" className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
              {pendingAttachment.file.name}
            </span>
          </div>
          <button
            onClick={() => setPendingAttachment(null)}
            aria-label="إزالة المرفق"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-slate-500"
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-white dark:bg-slate-700">
              <X className="size-3.5" aria-hidden />
            </span>
          </button>
        </div>
      )}

      {/* Input Composer */}
      <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 pt-2 pb-1 bg-slate-50 dark:bg-slate-950">
        <div className="flex items-center gap-1 mb-2">
          <button
            onClick={() => setLibraryOpen(true)}
            disabled={isGenerating || uploadingAttachment}
            className="chip"
          >
            <BookOpen className="size-4" />
            المكتبة
          </button>
          <span className="text-[11px] text-slate-500">
            PDF، DOCX، PPTX، TXT حتى 10MB
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-1.5 shadow-xs">
          {/* Gallery Pick */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAttachment || isGenerating}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 active:scale-95"
            aria-label="المعرض"
          >
            <ImageIcon className="size-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelected}
          />

          {/* Camera Capture */}
          <button
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploadingAttachment || isGenerating}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 active:scale-95"
            aria-label="الكاميرا"
          >
            <Camera className="size-4" />
          </button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleCameraSelected}
          />

          {/* Document Pick */}
          <button
            onClick={openDocumentPicker}
            disabled={uploadingAttachment || isGenerating}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 active:scale-95"
            aria-label="ملف"
          >
            <Paperclip className="size-4" />
          </button>
          <input
            ref={docInputRef}
            type="file"
            accept=".pdf,.docx,.pptx,.txt"
            className="hidden"
            onChange={handleDocSelected}
          />

          {/* Text Input */}
          <textarea
            rows={2}
            aria-label="رسالتك للمعلم"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              uploadingAttachment
                ? "جارٍ تجهيز المرفق..."
                : "اسأل المعلم عن أي شيء..."
            }
            disabled={uploadingAttachment || loadingConversation}
            className="w-full order-first min-w-0 resize-none min-h-12 max-h-32 px-2 text-xs bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 outline-hidden"
          />

          {/* Send / Stop */}
          {isGenerating ? (
            <button
              onClick={handleStop}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white active:scale-95"
              aria-label="إيقاف"
            >
              <StopCircle className="size-4" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={
                (!input.trim() && !pendingAttachment) ||
                uploadingAttachment ||
                loadingConversation
              }
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white active:scale-95 disabled:opacity-40 shadow-xs"
              aria-label="إرسال"
            >
              <Send className="size-4 rotate-180" />
            </button>
          )}
        </div>
      </div>
      <BottomSheet
        isOpen={subjectPickerOpen}
        onClose={() => setSubjectPickerOpen(false)}
        title="اختر مادة الملف"
      >
        <p className="text-sm text-slate-500 mb-3">
          نربط الملف بالمادة حتى يشرح المعلم محتواه ضمن منهجك.
        </p>
        <select
          aria-label="مادة الملف"
          value={pickerSubject}
          onChange={(e) => setPickerSubject(e.target.value)}
          className="field w-full"
        >
          <option value="">اختر المادة</option>
          {availableSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name_ar}
            </option>
          ))}
        </select>
        <button
          className="btn-primary w-full mt-3"
          disabled={!pickerSubject}
          onClick={() => {
            setSubjectId(pickerSubject);
            setSubjectPickerOpen(false);
          }}
        >
          تأكيد المادة
        </button>
        <p className="text-xs text-slate-500 mt-3">
          بعد التأكيد، اضغط زر الملف لاختيار المرفق.
        </p>
      </BottomSheet>
      <BottomSheet
        isOpen={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        title="مصادر المكتبة للمحادثة"
      >
        <LibraryScreen subjectId={subjectId} onAttach={attachSource} />
      </BottomSheet>
      <BottomSheet
        isOpen={chaptersOpen}
        onClose={() => setChaptersOpen(false)}
        title={study?.activeDocument ? `الفصول — ${study.activeDocument.title}` : "الفصول"}
      >
        {study?.activeDocument?.confidence === "low" && (
          <p className="mb-3 text-xs text-amber-700">
            لم أتأكد من ترتيب الفصول بدقة؛ اختر الفصل الصحيح وسأبدأ منه.
          </p>
        )}
        <ul className="space-y-2">
          {(study?.outline ?? []).map((chapter) => {
            const current = study?.studyContext?.chapterIndex === chapter.index;
            return (
              <li key={chapter.index}>
                <button
                  className={`min-h-11 w-full rounded-xl border p-3 text-start text-sm ${
                    current ? "border-primary bg-teal-50 text-primary font-bold" : "border-slate-200 dark:border-slate-800"
                  }`}
                  onClick={() => studyChapter(chapter)}
                >
                  <span dir="auto">{chapter.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          يمكنك أيضًا كتابة «اشرحلي الفصل 4» أو «كمل» أو «اختبرني فيه» في المحادثة.
        </p>
      </BottomSheet>
    </div>
  );
}
