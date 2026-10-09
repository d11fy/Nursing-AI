"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { BookOpen, Check, FileText, ImagePlus, Loader2, Send, Square, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ActiveSourceChips, LibraryPicker } from "@/components/chat/library-picker";
import type { ActiveLibrarySource } from "@/lib/library-types";
import { ChatFileError, waitForChatFile, type ChatFileUpload } from "@/lib/chat/attachments";

export interface PendingImage {
  path: string;
  previewUrl: string;
  name: string;
  size: number;
  attachmentId?: string;
  conversationId?: string;
  lectureId?: string;
  kind?: "image" | "file";
}

export interface ChatSubjectOption {
  id: string;
  name: string;
}

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const ACCEPTED_FILE_EXTENSIONS = ["pdf", "docx", "pptx", "txt"];
const CHAT_FILE_MAX_SIZE_MB = 10;

function formatFileSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  isGenerating,
  pendingImage,
  onImageChange,
  maxImageSizeMb = 8,
  conversationId,
  subjectId,
  availableSubjects = [],
  onSubjectChange,
  activeSources,
  onActiveSourcesChange,
  onConversationCreated,
  onFileReady,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  isGenerating: boolean;
  pendingImage: PendingImage | null;
  onImageChange: (image: PendingImage | null) => void;
  maxImageSizeMb?: number;
  conversationId?:string|null;
  subjectId?:string|null;
  availableSubjects?: ChatSubjectOption[];
  onSubjectChange?: (subjectId: string) => void;
  activeSources: ActiveLibrarySource[];
  onActiveSourcesChange: (sources: ActiveLibrarySource[]) => void;
  onConversationCreated: (conversationId: string) => void;
  /** The uploaded file finished preparation (the chat refreshes its book/chapter list). */
  onFileReady?: () => void;
}) {
  const [uploadingKind, setUploadingKind] = useState<"image" | "file" | null>(null);
  const [fileStatus, setFileStatus] = useState("");
  const [fileFailure, setFileFailure] = useState<{ lectureId: string; conversationId: string; message: string; file: File } | null>(null);
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState(subjectId ?? "");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadSubjectRef = useRef(subjectId);
  const isUploading = uploadingKind !== null;

  useEffect(() => {
    uploadSubjectRef.current = subjectId;
  }, [subjectId]);

  function selectUploadSubject(nextSubjectId: string) {
    uploadSubjectRef.current = nextSubjectId;
    setSelectedSubjectId(nextSubjectId);
    onSubjectChange?.(nextSubjectId);
  }

  function openFilePicker() {
    if (uploadSubjectRef.current) {
      fileInputRef.current?.click();
      return;
    }
    if (availableSubjects.length === 0) {
      toast.error("لا توجد مادة متاحة لربط الملف بها");
      return;
    }
    if (availableSubjects.length === 1) {
      selectUploadSubject(availableSubjects[0].id);
      fileInputRef.current?.click();
      return;
    }
    setSubjectPickerOpen(true);
  }

  function confirmSubjectSelection() {
    if (!selectedSubjectId) {
      toast.error("اختر المادة أولًا");
      return;
    }
    selectUploadSubject(selectedSubjectId);
    setSubjectPickerOpen(false);
    fileInputRef.current?.click();
  }

  /** uploading -> processing -> ready | failed. The file cannot be used with the AI before it is ready. */
  async function prepareFile(upload: ChatFileUpload, file: File) {
    try {
      const ready = await waitForChatFile(
        upload,
        async (cid, lectureId) => {
          const response = await fetch(`/api/chat/files?${new URLSearchParams({ conversationId: cid, lectureId })}`, { cache: "no-store" });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error ?? "تعذرت معالجة الملف");
          return body;
        },
        { onStatus: (_status, phase) => setFileStatus(phase === "uploading" ? "جارٍ رفع الملف..." : "جارٍ تجهيز الملف للدراسة...") },
      );
      onImageChange({
        path: "",
        previewUrl: "",
        name: file.name,
        size: file.size,
        kind: "file",
        conversationId: ready.conversationId,
        lectureId: ready.lectureId,
        attachmentId: ready.attachmentId,
      });
      onFileReady?.();
      if (ready.chapterCount && ready.chapterCount > 1) toast.success(`الملف جاهز للدراسة (${ready.chapterCount} فصول)`);
    } catch (error) {
      if (error instanceof ChatFileError && error.retryable && error.code !== "FILE_PROCESSING")
        setFileFailure({ lectureId: error.lectureId, conversationId: upload.conversationId, message: error.message, file });
      else toast.error(error instanceof Error ? error.message : "تعذر تجهيز الملف");
    }
  }

  async function retryFile() {
    if (!fileFailure) return;
    const failure = fileFailure;
    setFileFailure(null);
    setUploadingKind("file");
    setFileStatus("جارٍ تجهيز الملف للدراسة...");
    try {
      const response = await fetch(`/api/lectures/${failure.lectureId}/retry`, { method: "POST" });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "تعذرت إعادة المحاولة");
      await prepareFile({ conversationId: failure.conversationId, lectureId: failure.lectureId, status: "processing" }, failure.file);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذرت إعادة المحاولة");
    } finally {
      setUploadingKind(null);
      setFileStatus("");
    }
  }

  async function handleFileSelect(file: File, kind: "image" | "file") {
    if (kind === "file") {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (!extension || !ACCEPTED_FILE_EXTENSIONS.includes(extension)) {
        toast.error("استخدم PDF أو DOCX أو PPTX أو TXT");
        return;
      }
      if (file.size > CHAT_FILE_MAX_SIZE_MB * 1024 * 1024) {
        toast.error(`الحد الأقصى لملف المحادثة ${CHAT_FILE_MAX_SIZE_MB}MB`);
        return;
      }
      setUploadingKind("file");
      setFileFailure(null);
      setFileStatus("جارٍ رفع الملف...");
      try {
        const form = new FormData();
        form.append("file", file);
        if (conversationId) form.append("conversationId", conversationId);
        if (uploadSubjectRef.current) form.append("subjectId", uploadSubjectRef.current);
        const response = await fetch("/api/chat/files", { method: "POST", body: form });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "تعذر رفع الملف");
        await prepareFile({ conversationId: data.conversationId, lectureId: data.lectureId, status: data.status ?? "processing" }, file);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "تعذر رفع الملف");
      } finally {
        setUploadingKind(null);
        setFileStatus("");
      }
      return;
    }

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error("نوع الملف غير مدعوم");
      return;
    }
    if (file.size > maxImageSizeMb * 1024 * 1024) {
      toast.error(`حجم الصورة أكبر من الحد المسموح. الحد الأقصى ${maxImageSizeMb}MB.`);
      return;
    }
    setUploadingKind("image");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر رفع الصورة");
      onImageChange({ path: data.path, previewUrl: data.url, name: file.name, size: file.size });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر رفع الصورة");
    } finally {
      setUploadingKind(null);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isGenerating && (value.trim() || pendingImage)) onSend();
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-2.5 shadow-[0_10px_30px_rgb(16_42_58/0.08)] sm:p-3">
      <ActiveSourceChips conversationId={conversationId??null} sources={activeSources} onChange={onActiveSourcesChange} disabled={isGenerating}/>
      {fileStatus && (
        <p role="status" aria-live="polite" className="mb-2 flex items-center gap-2 text-xs font-medium text-primary">
          <Loader2 className="size-4 animate-spin" />{fileStatus}
        </p>
      )}
      {fileFailure && (
        <div role="alert" className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          <span>{fileFailure.message}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void retryFile()}>إعادة المحاولة</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setFileFailure(null)}>إغلاق</Button>
        </div>
      )}
      {pendingImage && (
        <div className="mb-2 flex items-center gap-3">
          <div className="relative inline-block shrink-0">
            <div className="relative size-20 overflow-hidden rounded-lg border border-border">
              {pendingImage.kind === "file" ? (
                <FileText className="m-5 size-10 text-primary" />
              ) : (
                <Image src={pendingImage.previewUrl} alt="معاينة" fill className="object-contain" unoptimized />
              )}
            </div>
            <button
              onClick={() => onImageChange(null)}
              className="absolute -left-1.5 -top-1.5 flex size-8 cursor-pointer items-center justify-center rounded-full bg-foreground text-background focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="إزالة المرفق"
            >
              <X className="size-3" />
            </button>
          </div>
          <div className="min-w-0 text-xs text-muted-foreground">
            <p dir="auto" className="line-clamp-2 break-words font-medium text-foreground [unicode-bidi:plaintext]">{pendingImage.name}</p>
            <p>{formatFileSize(pendingImage.size)}</p>
          </div>
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-1.5 border-b border-border/70 pb-2">
        <LibraryPicker conversationId={conversationId??null} subjectId={subjectId} activeSources={activeSources} onSourcesChange={onActiveSourcesChange} onConversationCreated={onConversationCreated} disabled={isUploading||isGenerating}/>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file, "image");
            e.target.value = "";
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.pptx,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file, "file");
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => imageInputRef.current?.click()}
          disabled={isUploading || isGenerating}
          aria-label="رفع صورة"
          title={`رفع صورة حتى ${maxImageSizeMb}MB`}
          className="text-muted-foreground hover:text-primary"
        >
          {uploadingKind === "image" ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          صورة
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={openFilePicker}
          disabled={isUploading || isGenerating}
          aria-label={`رفع ملف دراسي حتى ${CHAT_FILE_MAX_SIZE_MB}MB`}
          title={`PDF أو DOCX أو PPTX أو TXT حتى ${CHAT_FILE_MAX_SIZE_MB}MB`}
          className="text-muted-foreground hover:text-primary"
        >
          {uploadingKind === "file" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
          ملف
          <span className="text-[10px] font-normal text-muted-foreground">حتى {CHAT_FILE_MAX_SIZE_MB}MB</span>
        </Button>
        {isUploading && (
          <span role="status" className="text-xs text-muted-foreground">
            {uploadingKind === "file" ? "جارٍ رفع الملف وتجهيزه..." : "جارٍ رفع الصورة..."}
          </span>
        )}
      </div>

      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="اسأل عن موضوع، حالة، أو محاضرة..."
          rows={1}
          dir="auto"
          className="max-h-40 min-h-11 min-w-0 flex-1 resize-none border-transparent bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
        />

        {isGenerating ? (
          <Button type="button" variant="destructive" size="icon" onClick={onStop} aria-label="إيقاف">
            <Square className="size-4" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            onClick={onSend}
            disabled={isUploading || (!value.trim() && !pendingImage)}
            aria-label="إرسال"
          >
            <Send className="size-4" />
          </Button>
        )}
      </div>

      <Dialog open={subjectPickerOpen} onOpenChange={setSubjectPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>اختر مادة الملف</DialogTitle>
            <DialogDescription>
              سنربط الملف بالمادة حتى يشرح المساعد محتواه ضمن سياقك الدراسي الصحيح.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 space-y-2 overflow-y-auto" role="radiogroup" aria-label="المادة الدراسية">
            {availableSubjects.map((subject) => {
              const selected = selectedSubjectId === subject.id;
              return (
                <button
                  key={subject.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSelectedSubjectId(subject.id)}
                  className={`flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border px-3 text-start transition-colors focus-visible:ring-2 focus-visible:ring-primary ${selected ? "border-primary bg-accent text-primary" : "border-border bg-card hover:bg-muted"}`}
                >
                  <BookOpen className="size-4 shrink-0" />
                  <span dir="auto" className="min-w-0 flex-1 break-words font-medium [unicode-bidi:plaintext]">{subject.name}</span>
                  {selected && <Check className="size-4 shrink-0" />}
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSubjectPickerOpen(false)}>
              إلغاء
            </Button>
            <Button type="button" onClick={confirmSubjectSelection} disabled={!selectedSubjectId}>
              اختيار الملف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
