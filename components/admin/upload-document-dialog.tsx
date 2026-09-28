"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  Zap,
  Trash2,
  Ban,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk
const MAX_CHUNK_RETRIES = 3;

const SOURCE_TYPES = [
  { value: "book", label: "كتاب" },
  { value: "lecture", label: "محاضرة" },
  { value: "notes", label: "ملاحظات" },
  { value: "questions", label: "أسئلة" },
  { value: "reference", label: "مرجع" },
] as const;

type SourceType = (typeof SOURCE_TYPES)[number]["value"];
type FileStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

interface FileQueueItem {
  id: string;
  file: File;
  title: string;
  subjectId: string;
  sourceType: SourceType;
  status: FileStatus;
  uploadId?: string;
  totalChunks: number;
  uploadedChunks: number;
  uploadedBytes: number;
  currentChunkLoaded: number;
  percent: number;
  speedMBs: number;
  etaText: string;
  errorMessage?: string;
  xhr?: XMLHttpRequest | null;
  abortController?: AbortController | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 1 ? 1 : 0)} ${sizes[i]}`;
}

function formatArabicEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "جاري الحساب...";
  if (seconds < 60) return `حوالي ${seconds} ثانية`;
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (minutes === 1) {
    return remSec > 0 ? `حوالي دقيقة و ${remSec} ثانية` : "حوالي دقيقة واحدة";
  }
  if (minutes === 2) {
    return remSec > 0 ? `حوالي دقيقتين و ${remSec} ثانية` : "حوالي دقيقتين";
  }
  if (minutes <= 10) {
    return remSec > 0 ? `حوالي ${minutes} دقائق و ${remSec} ثانية` : `حوالي ${minutes} دقائق`;
  }
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours > 0) {
    return `حوالي ${hours} ساعة و ${remMin} دقيقة`;
  }
  return `حوالي ${minutes} دقيقة`;
}

export function UploadDocumentDialog({
  subjects,
}: {
  subjects: { id: string; name_ar: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<FileQueueItem[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [defaultSubjectId, setDefaultSubjectId] = useState<string>(subjects[0]?.id ?? "");
  const [defaultSourceType, setDefaultSourceType] = useState<SourceType>("reference");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep a ref to the active queue so asynchronous callbacks always read current state
  const queueRef = useRef<FileQueueItem[]>([]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const updateItem = useCallback((id: string, patch: Partial<FileQueueItem>) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }, []);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: FileQueueItem[] = Array.from(files).map((file) => {
      const titleWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      const isZeroByte = !file.size || file.size <= 0;
      const totalChunks = isZeroByte ? 1 : Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
      return {
        id: crypto.randomUUID(),
        file,
        title: titleWithoutExt,
        subjectId: defaultSubjectId || subjects[0]?.id || "",
        sourceType: defaultSourceType,
        status: isZeroByte ? "failed" : "pending",
        totalChunks,
        uploadedChunks: 0,
        uploadedBytes: 0,
        currentChunkLoaded: 0,
        percent: 0,
        speedMBs: 0,
        etaText: "—",
        errorMessage: isZeroByte
          ? "حجم هذا الملف 0 بايت على جهازك (ملف فارغ أو لم يكتمل نسخه/تنزيله). تأكد من اكتمال الملف على جهازك أو اختر الملف الأصلي وليس النسخة الفارغة."
          : undefined,
      };
    });

    setQueue((prev) => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeItem(id: string) {
    const item = queueRef.current.find((q) => q.id === id);
    if (item?.status === "uploading") {
      cancelUpload(id);
    }
    setQueue((prev) => prev.filter((q) => q.id !== id));
  }

  async function cancelUpload(id: string) {
    const item = queueRef.current.find((q) => q.id === id);
    if (!item) return;

    // Abort active XHR request
    if (item.xhr) {
      try {
        item.xhr.abort();
      } catch (err) {
        console.error("XHR abort error:", err);
      }
    }
    if (item.abortController) {
      try {
        item.abortController.abort();
      } catch (err) {
        console.error("AbortController abort error:", err);
      }
    }

    updateItem(id, {
      status: "cancelled",
      xhr: null,
      abortController: null,
      errorMessage: "تم إلغاء الرفع بناءً على طلبك",
    });

    // Notify backend to purge any chunks stored so no corrupted file remains
    if (item.uploadId) {
      try {
        await fetch("/api/admin/knowledge/upload/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId: item.uploadId }),
        });
      } catch (err) {
        console.error("Server cancel purge error:", err);
      }
    }

    toast.info(`تم إلغاء رفع: ${item.file.name}`);
  }

  // Upload an individual chunk with progress tracking using XMLHttpRequest
  const uploadChunkXHR = useCallback(
    (
      uploadId: string,
      chunkIndex: number,
      chunkBlob: Blob,
      onProgress: (loadedBytes: number) => void
    ): Promise<void> => {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append("uploadId", uploadId);
        formData.append("chunkIndex", String(chunkIndex));
        formData.append("chunk", chunkBlob);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress(e.loaded);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            let errorMsg = "فشل رفع جزء من الملف";
            try {
              const res = JSON.parse(xhr.responseText);
              if (res.error) errorMsg = res.error;
            } catch {
              // fallback to statusText
            }
            reject(new Error(errorMsg));
          }
        };

        xhr.onerror = () => {
          reject(new Error("تعذر إكمال رفع الملف بسبب انقطاع الاتصال. حاول مرة أخرى."));
        };

        xhr.onabort = () => {
          reject(new Error("تم إلغاء الرفع"));
        };

        xhr.open("POST", "/api/admin/knowledge/upload/chunk");
        xhr.send(formData);

        // Store xhr instance for cancellation
        setQueue((prev) =>
          prev.map((it) => (it.uploadId === uploadId ? { ...it, xhr } : it))
        );
      });
    },
    []
  );

  const processFileItem = useCallback(
    async (item: FileQueueItem) => {
      if (!item.subjectId) {
        updateItem(item.id, {
          status: "failed",
          errorMessage: "يرجى اختيار مادة دراسية أولاً",
        });
        return;
      }

      updateItem(item.id, {
        status: "uploading",
        percent: 0,
        uploadedBytes: 0,
        errorMessage: undefined,
      });

      let uploadId = item.uploadId;
      let existingChunks: Set<number> = new Set();

      // Step 1: Initialize Upload Session or resume existing
      try {
        if (!uploadId) {
          const initRes = await fetch("/api/admin/knowledge/upload/init", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: item.title,
              subjectId: item.subjectId,
              sourceType: item.sourceType,
              fileName: item.file.name,
              fileSize: item.file.size,
              mimeType: item.file.type || "application/octet-stream",
              totalChunks: item.totalChunks,
            }),
          });
          const initData = await initRes.json();
          if (!initRes.ok) {
            throw new Error(initData.error || "فشل بدء جلسة رفع الملف");
          }
          uploadId = initData.uploadId;
          updateItem(item.id, { uploadId });
        } else {
          // Check already uploaded chunks for resumable upload
          const statusRes = await fetch(
            `/api/admin/knowledge/upload/status?uploadId=${encodeURIComponent(uploadId)}`
          );
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (Array.isArray(statusData.uploadedChunkIndices)) {
              existingChunks = new Set(statusData.uploadedChunkIndices);
            }
          }
        }
      } catch (err) {
        console.error("Init upload error:", err);
        updateItem(item.id, {
          status: "failed",
          errorMessage: err instanceof Error ? err.message : "فشل بدء جلسة رفع الملف",
        });
        return;
      }

      // Step 2: Upload Chunks sequentially with progress and retry
      const fileSize = item.file.size;
      const totalChunks = item.totalChunks;
      let totalBytesUploadedBefore = 0;
      for (const idx of existingChunks) {
        const start = idx * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, fileSize);
        totalBytesUploadedBefore += end - start;
      }

      let lastSpeedCalcTime = Date.now();
      let lastSpeedBytes = totalBytesUploadedBefore;

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        // Check if user cancelled while looping
        const currentItem = queueRef.current.find((q) => q.id === item.id);
        if (currentItem?.status === "cancelled") {
          return;
        }

        // Skip chunk if already uploaded (resumed)
        if (existingChunks.has(chunkIndex)) {
          continue;
        }

        const startByte = chunkIndex * CHUNK_SIZE;
        const endByte = Math.min(startByte + CHUNK_SIZE, fileSize);
        const chunkBlob = item.file.slice(startByte, endByte);

        let retryCount = 0;
        let chunkUploaded = false;

        while (retryCount < MAX_CHUNK_RETRIES && !chunkUploaded) {
          try {
            await uploadChunkXHR(
              uploadId!,
              chunkIndex,
              chunkBlob,
              (loadedBytes) => {
                const totalLoaded = startByte + loadedBytes;
                const now = Date.now();
                const timeDiffSec = (now - lastSpeedCalcTime) / 1000;

                let speedMBs = currentItem?.speedMBs || 0;
                let etaText = currentItem?.etaText || "—";

                if (timeDiffSec >= 0.5) {
                  const bytesDiff = totalLoaded - lastSpeedBytes;
                  const currentSpeed = bytesDiff / timeDiffSec; // B/s
                  speedMBs = Math.max(0.1, currentSpeed / (1024 * 1024));

                  const remainingBytes = Math.max(0, fileSize - totalLoaded);
                  const secondsRemaining = Math.ceil(remainingBytes / (speedMBs * 1024 * 1024));
                  etaText = formatArabicEta(secondsRemaining);

                  lastSpeedCalcTime = now;
                  lastSpeedBytes = totalLoaded;
                }

                const percent = Math.min(99, Math.round((totalLoaded / fileSize) * 100));

                updateItem(item.id, {
                  uploadedBytes: totalLoaded,
                  percent,
                  speedMBs,
                  etaText,
                });
              }
            );
            chunkUploaded = true;
          } catch (err) {
            // Check if cancelled
            const check = queueRef.current.find((q) => q.id === item.id);
            if (check?.status === "cancelled") return;

            retryCount++;
            if (retryCount >= MAX_CHUNK_RETRIES) {
              console.error(`Chunk ${chunkIndex} failed after retries:`, err);
              updateItem(item.id, {
                status: "failed",
                errorMessage:
                  "تعذر إكمال رفع الملف بسبب انقطاع الاتصال. يمكنك إعادة المحاولة لاستكمال الأجزاء المتبقية.",
              });
              return;
            }
            // Wait 1 second before retry
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }

      // Step 3: Complete upload
      updateItem(item.id, {
        uploadedBytes: fileSize,
        percent: 100,
        etaText: "اكتمل الرفع",
      });

      let documentId: string;
      try {
        const compRes = await fetch("/api/admin/knowledge/upload/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId }),
        });
        let compData: { error?: string; documentId?: string } = {};
        try {
          compData = await compRes.json();
        } catch {
          throw new Error("استجابة غير صالحة من الخادم أثناء تجميع أجزاء الملف");
        }
        if (!compRes.ok || !compData.documentId) {
          throw new Error(compData.error || "فشل إنهاء وتجميع أجزاء الملف");
        }
        documentId = compData.documentId;
      } catch (err) {
        console.error("Complete upload error:", err);
        updateItem(item.id, {
          status: "failed",
          errorMessage: err instanceof Error ? err.message : "فشل إكمال عملية الرفع",
        });
        return;
      }

      // Step 4: Processing Phase (RAG embedding and indexing)
      // Clearly separated phase: "تم رفع الملف بنجاح، جاري تحليل وتجهيز المحتوى للتدريب..."
      updateItem(item.id, {
        status: "processing",
        speedMBs: 0,
        etaText: "تم الرفع بنجاح ✓ جارٍ استخراج المحتوى وتوليد التضمينات...",
      });

      try {
        const procRes = await fetch("/api/admin/knowledge/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId }),
        });

        if (!procRes.ok) {
          let errorMsg = "فشلت معالجة الملف في نظام الذكاء الاصطناعي";
          try {
            const errData = await procRes.json();
            if (errData.error) errorMsg = errData.error;
          } catch {
            if (procRes.status === 502) errorMsg = "انقطاع مؤقت في الاتصال بالخادم (502 Bad Gateway)";
          }
          throw new Error(errorMsg);
        }

        // Poll document processing status until ready or failed
        let isDone = false;
        let attempts = 0;
        const maxAttempts = 180; // 180 * 2s = 6 minutes max

        while (!isDone && attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 2000));
          attempts++;

          // Check if cancelled
          const check = queueRef.current.find((q) => q.id === item.id);
          if (check?.status === "cancelled") return;

          try {
            const pollRes = await fetch(
              `/api/admin/knowledge/process?documentId=${encodeURIComponent(documentId)}`
            );
            if (pollRes.ok) {
              const pollData = await pollRes.json();
              if (pollData.status === "ready") {
                isDone = true;
                updateItem(item.id, {
                  status: "completed",
                  etaText: `جاهز ومفهرس (${pollData.chunk_count || 0} مقطع)`,
                });
                toast.success(`تم رفع وتدريب: ${item.file.name}`);
                router.refresh();
                return;
              } else if (pollData.status === "failed") {
                isDone = true;
                throw new Error(pollData.error_message || "فشلت معالجة وتدريب الملف");
              } else {
                updateItem(item.id, {
                  status: "processing",
                  etaText: "جارٍ استخراج النصوص وتوليد التضمينات بالذكاء الاصطناعي...",
                });
              }
            }
          } catch (pollErr) {
            if (pollErr instanceof Error && pollErr.message.includes("فشلت")) {
              throw pollErr;
            }
            console.warn("Poll status check:", pollErr);
          }
        }

        if (!isDone) {
          updateItem(item.id, {
            status: "completed",
            etaText: "اكتمل الرفع، والمستند قيد الفهرسة في الخلفية",
          });
          toast.info(`المعالجة مستمرة في الخلفية لملف: ${item.file.name}`);
          router.refresh();
        }
      } catch (err) {
        console.error("Processing error:", err);
        updateItem(item.id, {
          status: "failed",
          errorMessage:
            err instanceof Error
              ? err.message
              : "تم رفع الملف ولكن حدث خطأ أثناء فهرسته وتدريبه",
        });
        toast.error(`خطأ أثناء معالجة ${item.file.name}`);
      }
    },
    [router, updateItem, uploadChunkXHR]
  );

  // Queue runner: processes files sequentially to ensure smooth performance on VPS
  const startUploadAll = async () => {
    setIsProcessingQueue(true);
    const pendingItems = queueRef.current.filter(
      (q) => q.status === "pending" || q.status === "failed"
    );

    for (const item of pendingItems) {
      // Re-read current status in case user removed or cancelled it
      const current = queueRef.current.find((q) => q.id === item.id);
      if (!current || current.status === "cancelled" || current.status === "completed") {
        continue;
      }
      await processFileItem(current);
    }

    setIsProcessingQueue(false);
  };

  // Overall statistics for multi-file upload
  const totalFiles = queue.length;
  const completedFiles = queue.filter((q) => q.status === "completed").length;
  const totalBytesAll = queue.reduce((acc, q) => acc + q.file.size, 0);
  const uploadedBytesAll = queue.reduce((acc, q) => acc + q.uploadedBytes, 0);
  const overallPercent =
    totalBytesAll > 0 ? Math.min(100, Math.round((uploadedBytesAll / totalBytesAll) * 100)) : 0;

  const hasUploading = queue.some((q) => q.status === "uploading" || q.status === "processing");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-2 shadow-sm font-medium"><Upload className="size-4" />رفع ملفات التدريب</Button>} />
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto sm:p-6" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="size-5 text-indigo-500" />
            رفع مصادر تعليمية وتدريبية (بدون حد للحجم)
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            يدعم كتب ومراجع الـ PDF الكبيرة، المستندات، العروض التقديمية حتى 1GB+ عبر الرفع المجزأ والآمن (Chunked Streaming).
          </p>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Default selection controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-border">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">المادة الافتراضية</Label>
              <Select
                value={defaultSubjectId}
                onValueChange={(val) => {
                  if (!val) return;
                  setDefaultSubjectId(val);
                  setQueue((prev) =>
                    prev.map((it) => (it.status === "pending" ? { ...it, subjectId: val } : it))
                  );
                }}
              >
                <SelectTrigger className="w-full bg-background text-xs h-9">
                  <SelectValue placeholder="اختر المادة الدراسية">
                    {(val: string) => subjects.find((s) => s.id === val)?.name_ar}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      {s.name_ar}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">نوع المصدر الافتراضي</Label>
              <Select
                value={defaultSourceType}
                onValueChange={(val) => {
                  if (!val) return;
                  const source = val as SourceType;
                  setDefaultSourceType(source);
                  setQueue((prev) =>
                    prev.map((it) => (it.status === "pending" ? { ...it, sourceType: source } : it))
                  );
                }}
              >
                <SelectTrigger className="w-full bg-background text-xs h-9">
                  <SelectValue>
                    {(val: string) => SOURCE_TYPES.find((t) => t.value === val)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dropzone / File Picker */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border hover:border-primary/50 transition-colors rounded-2xl p-6 text-center cursor-pointer bg-card/60 hover:bg-muted/40 group"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.txt,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.md"
              className="hidden"
              onChange={handleFileSelect}
            />
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-105 transition-transform">
                <Upload className="size-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">
                اضغط لاختيار ملف أو عدة ملفات تدريب
              </p>
              <p className="text-xs text-muted-foreground">
                PDF، DOCX، PPTX، TXT — لا يوجد حد برمجي لحجم الملف للأدمن
              </p>
            </div>
          </div>

          {/* Overall Progress for multi-file */}
          {queue.length > 1 && (
            <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-1.5 text-primary">
                  <FileText className="size-4" />
                  التقدم الإجمالي: {completedFiles} من {totalFiles} ملفات مكتملة
                </span>
                <span className="font-semibold text-primary">
                  {formatBytes(uploadedBytesAll)} / {formatBytes(totalBytesAll)} ({overallPercent}%)
                </span>
              </div>
              <div className="w-full h-2 bg-primary/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${overallPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Files Queue List */}
          {queue.length > 0 && (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {queue.map((item) => {
                const ext = item.file.name.split(".").pop()?.toUpperCase() || "FILE";
                return (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl border border-border bg-card space-y-3 shadow-xs relative transition-all"
                  >
                    {/* Header info */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="size-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0">
                          {ext}
                        </div>
                        <div className="min-w-0 flex-1">
                          {item.status === "pending" ? (
                            <Input
                              value={item.title}
                              onChange={(e) => updateItem(item.id, { title: e.target.value })}
                              className="h-8 text-xs font-medium"
                              placeholder="عنوان الملف في قاعدة المعرفة"
                            />
                          ) : (
                            <p className="text-sm font-semibold truncate text-foreground">
                              {item.title}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{item.file.name}</span>
                            <span>•</span>
                            <span className={`font-medium ${item.file.size <= 0 ? "text-destructive font-bold" : "text-foreground"}`}>
                              {item.file.size <= 0 ? "0 بايت (ملف فارغ على جهازك)" : formatBytes(item.file.size)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Status Badges & Action Buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        {item.status === "pending" && (
                          <>
                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
                              بانتظار الرفع
                            </span>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => removeItem(item.id)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        )}

                        {item.status === "uploading" && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => cancelUpload(item.id)}
                            className="h-7 text-xs gap-1"
                          >
                            <Ban className="size-3" />
                            إلغاء الرفع
                          </Button>
                        )}

                        {item.status === "processing" && (
                          <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium flex items-center gap-1.5 animate-pulse">
                            <Loader2 className="size-3 animate-spin" />
                            جارٍ المعالجة والتدريب...
                          </span>
                        )}

                        {item.status === "completed" && (
                          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1.5">
                            <CheckCircle2 className="size-3.5" />
                            اكتمل بنجاح
                          </span>
                        )}

                        {item.status === "cancelled" && (
                          <span className="text-xs px-2.5 py-1 rounded-full bg-slate-500/10 text-slate-500 border border-slate-500/20 font-medium flex items-center gap-1.5">
                            <Ban className="size-3" />
                            تم الإلغاء
                          </span>
                        )}

                        {item.status === "failed" && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs px-2.5 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive/20 font-medium flex items-center gap-1.5">
                              <AlertCircle className="size-3" />
                              فشل الرفع
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => processFileItem(item)}
                            >
                              إعادة المحاولة
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar & Telemetry (during uploading or completed) */}
                    {(item.status === "uploading" || item.status === "processing" || item.status === "completed") && (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-foreground">
                              {item.percent}%
                            </span>
                            <span className="text-muted-foreground tabular-nums">
                              {formatBytes(item.uploadedBytes)} / {formatBytes(item.file.size)}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-muted-foreground">
                            {item.status === "uploading" && item.speedMBs > 0 && (
                              <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
                                <Zap className="size-3" />
                                {item.speedMBs.toFixed(1)} MB/s
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="size-3" />
                              {item.etaText}
                            </span>
                          </div>
                        </div>

                        {/* Animated Smooth Progress Track */}
                        <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              item.status === "completed"
                                ? "bg-emerald-500"
                                : item.status === "processing"
                                ? "bg-amber-500 animate-pulse"
                                : "bg-gradient-to-r from-blue-600 to-indigo-600"
                            }`}
                            style={{ width: `${item.percent}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Phase Banner for Post-upload processing (Requirement #7) */}
                    {item.status === "processing" && (
                      <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                        <Loader2 className="size-4 animate-spin shrink-0" />
                        <div>
                          <p className="font-semibold">تم رفع الملف بنجاح ✓</p>
                          <p className="text-[11px] opacity-90">
                            جاري تحليل واستخراج النص وتوليد التضمينات (Embeddings) للتدريب وقاعدة المعرفة...
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Completed Banner */}
                    {item.status === "completed" && (
                      <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
                        <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                        <p className="font-semibold">
                          تم رفع وتجهيز الملف بنجاح وأصبح جاهزاً للاستخدام في تدريب الذكاء الاصطناعي والإجابات.
                        </p>
                      </div>
                    )}

                    {/* Error Banner with Friendly Arabic Message */}
                    {item.status === "failed" && item.errorMessage && (
                      <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-xs text-destructive">
                        <AlertCircle className="size-4 shrink-0" />
                        <p>{item.errorMessage}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Action buttons footer */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="text-xs text-muted-foreground">
              {queue.length > 0
                ? `${queue.length} ملفات في القائمة`
                : "لم يتم اختيار أي ملف بعد"}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (hasUploading) {
                    toast.warning("هناك ملفات قيد الرفع حالياً، يرجى إلغاؤها أولاً قبل الإغلاق");
                    return;
                  }
                  setOpen(false);
                }}
              >
                إغلاق
              </Button>

              <Button
                onClick={startUploadAll}
                disabled={
                  queue.length === 0 ||
                  isProcessingQueue ||
                  !queue.some((q) => q.status === "pending" || q.status === "failed")
                }
                size="sm"
                className="gap-2 px-5"
              >
                {isProcessingQueue ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    جارٍ الرفع والمعالجة...
                  </>
                ) : (
                  <>
                    <Upload className="size-4" />
                    بدء الرفع والتدريب
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
