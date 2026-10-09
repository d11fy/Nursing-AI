import React, { useEffect, useRef, useState } from "react";
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
import { waitForChatFile } from "../../../lib/chat/attachments";
import { resolveOfficialUrl } from "../services/api";
import { apiFetch, apiStream, apiUpload } from "../services/api";

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
          setSubjectId(res.conversation.subject_id);
          setActiveSources(res.activeSources || []);
        })
        .catch((err) => {
          if (!controller.signal.aborted) setError(err.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingConversation(false);
        });
    }
    return () => controller.abort();
  }, [initialConversationId]);

  const handleStartNewChat = () => {
    abortControllerRef.current?.abort();
    uploadControllerRef.current?.abort();
    setIsGenerating(false);
    setUploadingAttachment(false);
    setConversationId(null);
    setMessages([]);
    setInput("");
    setPendingAttachment(null);
    setActiveSources([]);
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
    setSubjectId((id) => id || resource.subjectId);
    setActiveSources((prev) => [
      ...prev.filter((item) => item.id !== res.source.id),
      res.source,
    ]);
    setLibraryOpen(false);
    showToast("تم إرفاق المصدر للمحادثة");
  };
  const removeSource = async (id: string) => {
    if (!conversationId || isGenerating) return;
    try {
      await apiFetch("/api/library/sources", {
        method: "DELETE",
        body: JSON.stringify({ conversationId, documentId: id }),
      });
      setActiveSources((prev) => prev.filter((item) => item.id !== id));
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
      setConversationId(uploaded.conversationId);
      const ready = await waitForChatFile(
        uploaded,
        (cid, lectureId) =>
          apiFetch(
            `/api/chat/files?${new URLSearchParams({ conversationId: cid, lectureId })}`,
            { signal: controller.signal },
          ),
        {
          signal: controller.signal,
          onStatus: () =>
            setAttachmentStatus(
              "جارٍ تجهيز الملف للدراسة... يمكنك إلغاء الانتظار",
            ),
        },
      );
      setPendingAttachment({
        type: "file",
        file,
        attachmentId: ready.attachmentId,
        lectureId: ready.lectureId,
      });
      showToast("الملف جاهز للدراسة");
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

  const handleSend = async () => {
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

    const userMessage: Message = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: currentText,
      imageUrl: pendingAttachment?.previewUrl || null,
    };

    const assistantMessage: Message = {
      id: `local-asst-${Date.now()}`,
      role: "assistant",
      content: "",
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    const attachmentPath = pendingAttachment?.path;
    const attachmentId = pendingAttachment?.attachmentId;
    const uploadedLectureId = pendingAttachment?.lectureId;
    setPendingAttachment(null);
    setIsGenerating(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await apiStream(
        "/api/chat",
        {
          conversationId: conversationId || undefined,
          content: currentText,
          subjectId: subjectId || undefined,
          lectureId: uploadedLectureId || initialLectureId || undefined,
          imagePath: attachmentPath || undefined,
          attachmentId: attachmentId || undefined,
        },
        {
          onConversationId: (id) => setConversationId(id),
          onChunk: (chunk) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id
                  ? { ...m, content: m.content + chunk }
                  : m,
              ),
            );
          },
          onMessageIds: (assistantId, userId) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id
                  ? { ...m, id: assistantId }
                  : m.id === userMessage.id
                    ? { ...m, id: userId }
                    : m,
              ),
            );
          },
          onComplete: () => {
            setIsGenerating(false);
          },
          onError: (err) => {
            setError(err.message || "حدث خطأ أثناء الاتصال بالمعلم الذكي");
            setIsGenerating(false);
          },
        },
        controller.signal,
      );
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setError("حدث خطأ أثناء المحادثة");
      }
      setIsGenerating(false);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsGenerating(false);
      }
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    setIsGenerating(false);
  };

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
          messages.map((m) => (
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
          <div className="flex items-center gap-2 text-xs text-primary font-bold animate-pulse px-2">
            <Sparkles className="size-3.5" />
            <span>جارٍ التفكير وصياغة الشرح...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

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
                void handleSend();
              }
            }}
            placeholder={
              uploadingAttachment
                ? "جارٍ رفع المرفق..."
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
    </div>
  );
}
