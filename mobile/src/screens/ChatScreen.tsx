import React, { useEffect, useRef, useState } from "react";
import {
  Send,
  Image as ImageIcon,
  Camera,
  Paperclip,
  History,
  Sparkles,
  RefreshCw,
  X,
  FileText,
  StopCircle,
} from "lucide-react";
import { useNavigation } from "../context/NavigationContext";
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
}: {
  conversationId?: string | null;
  subjectId?: string | null;
  subjectName?: string | null;
}) {
  const { navigate } = useNavigation();

  const [conversationId, setConversationId] = useState<string | null>(initialConversationId || null);
  const [subjectId, setSubjectId] = useState<string | null>(initialSubjectId || null);
  const [subjectName, setSubjectName] = useState<string | null>(initialSubjectName || null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [availableSubjects, setAvailableSubjects] = useState<Array<{ id: string; name_ar: string }>>([]);

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

  // Load subjects for selector
  useEffect(() => {
    apiFetch("/api/subjects")
      .then((res) => {
        if (res.subjects) setAvailableSubjects(res.subjects);
      })
      .catch(() => {});
  }, []);

  // Load existing conversation if id provided
  useEffect(() => {
    if (initialConversationId) {
      apiFetch(`/api/conversations/${initialConversationId}`)
        .then((res) => {
          if (res.messages) {
            setMessages(res.messages);
            setConversationId(res.conversation.id);
            setSubjectId(res.conversation.subject_id);
          }
        })
        .catch(() => setMessages([]));
    }
  }, [initialConversationId]);

  const handleStartNewChat = () => {
    setConversationId(null);
    setMessages([]);
    setInput("");
    setPendingAttachment(null);
  };

  // Image Selection (Gallery)
  const handleImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAttachment(true);
    try {
      const previewUrl = URL.createObjectURL(file);
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
      alert(err.message || "فشل رفع الصورة");
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Camera Capture
  const handleCameraSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAttachment(true);
    try {
      const previewUrl = URL.createObjectURL(file);
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
      alert(err.message || "فشل التقاط الصورة");
    } finally {
      setUploadingAttachment(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  // Document File Selection
  const handleDocSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!subjectId) {
      alert("يرجى اختيار المادة أولاً لربط الملف الدراسي بها");
      return;
    }
    setUploadingAttachment(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (conversationId) form.append("conversationId", conversationId);
      if (subjectId) form.append("subjectId", subjectId);
      const res = await apiUpload("/api/chat/files", form);
      if (res.conversationId) setConversationId(res.conversationId);
      setPendingAttachment({
        type: "file",
        file,
        attachmentId: res.attachmentId,
        lectureId: res.lectureId,
      });
    } catch (err: any) {
      alert(err.message || "فشل رفع الملف");
    } finally {
      setUploadingAttachment(false);
      if (docInputRef.current) docInputRef.current.value = "";
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text && !pendingAttachment) return;

    const currentText = text || (pendingAttachment?.type === "image" ? "اشرح محتوى هذه الصورة بشكل سريري تعليمي لطالب تمريض." : "لخص أهم محتويات هذا الملف واشرحها.");

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
          lectureId: uploadedLectureId || undefined,
          imagePath: attachmentPath || undefined,
          attachmentId: attachmentId || undefined,
        },
        {
          onConversationId: (id) => setConversationId(id),
          onChunk: (chunk) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id ? { ...m, content: m.content + chunk } : m
              )
            );
          },
          onComplete: () => {
            setIsGenerating(false);
          },
          onError: (err) => {
            alert(err.message || "حدث خطأ أثناء الاتصال بالمعلم الذكي");
            setIsGenerating(false);
          },
        },
        controller.signal
      );
    } catch (err: any) {
      if (err.name !== "AbortError") {
        alert("حدث خطأ أثناء المحادثة");
      }
      setIsGenerating(false);
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
                اسألني عن الحالات السريرية، جرعات الأدوية، فسيولوجيا الأمراض، أو أرفق صورة وملفًا للشرح.
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
                    src={m.imageUrl}
                    alt="مرفق"
                    className="max-h-56 w-full rounded-2xl object-cover mb-2"
                  />
                )}
                {/* Message text formatted with line breaks */}
                <div className="whitespace-pre-wrap">{m.content}</div>
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
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
              {pendingAttachment.file.name}
            </span>
          </div>
          <button
            onClick={() => setPendingAttachment(null)}
            className="flex size-7 items-center justify-center rounded-full bg-white dark:bg-slate-700 text-slate-500"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Input Composer */}
      <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 pt-2 pb-1 bg-slate-50 dark:bg-slate-950">
        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-1.5 shadow-xs">
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
            onClick={() => docInputRef.current?.click()}
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
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={
              uploadingAttachment ? "جارٍ رفع المرفق..." : "اسأل المعلم عن أي شيء..."
            }
            disabled={uploadingAttachment}
            className="flex-1 h-9 px-2 text-xs bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 outline-hidden"
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
              disabled={(!input.trim() && !pendingAttachment) || uploadingAttachment}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white active:scale-95 disabled:opacity-40 shadow-xs"
              aria-label="إرسال"
            >
              <Send className="size-4 rotate-180" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
