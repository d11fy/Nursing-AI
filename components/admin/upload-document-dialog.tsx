"use client";

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
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
  Search,
  BookOpen,
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
  {value:'official_course_material',label:'مادة مساق رسمية'},
  {value:'required_textbook',label:'كتاب المساق المطلوب'},
  {value:'university_lecture',label:'محاضرة جامعية'},
  {value:'doctor_slides',label:'سلايدات الدكتور'},
  {value:'lab_manual',label:'دليل المختبر'},
  {value:'approved_notes',label:'ملاحظات معتمدة'},
  { value: "BOOK", label: "كتاب معتمد (Book)" },
  { value: "UNIVERSITY_LECTURE", label: "محاضرة جامعية رسمية (University Lecture)" },
  { value: "DOCTOR_SLIDES", label: "سلايدات الدكتور (Doctor Slides)" },
  { value: "SUMMARY", label: "ملخص دراسي (Summary)" },
  { value: "PAST_EXAM", label: "امتحان سنوات سابقة (Past Exam)" },
  { value: "QUESTION_BANK", label: "بنك أسئلة (Question Bank)" },
  { value: "MODEL_ANSWERS", label: "إجابات نموذجية (Model Answers)" },
  { value: "LAB_MATERIAL", label: "مادة المعمل السريري (Lab Material)" },
  { value: "REVIEW_NOTES", label: "ملاحظات مراجعة (Review Notes)" },
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
  examYear?: number;
  semester?: number;
  doctorName?: string;
  examType?: string;
  notes?: string;
  academicYearId?:string;
  priority?:number;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
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
  academicYears=[],
}: {
  subjects: { id: string; name_ar: string }[];
  academicYears?:{id:string;name_ar:string}[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<FileQueueItem[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [defaultSubjectId, setDefaultSubjectId] = useState<string>(subjects[0]?.id ?? "");
  const [defaultYear,setDefaultYear]=useState('');
  const [defaultPriority,setDefaultPriority]=useState('95');
  const [defaultSourceType, setDefaultSourceType] = useState<SourceType>("BOOK");
  const [defaultExamYear, setDefaultExamYear] = useState<string>(new Date().getFullYear().toString());
  const [defaultSemester, setDefaultSemester] = useState<string>("1");
  const [defaultDoctorName, setDefaultDoctorName] = useState<string>("");
  const [defaultExamType, setDefaultExamType] = useState<string>("FINAL");
  const [defaultNotes, setDefaultNotes] = useState<string>("");
  const [showAdvancedMeta, setShowAdvancedMeta] = useState(false);
  const [subjectSearch, setSubjectSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter subjects for the 56 courses in Nursing Faculty
  const filteredSubjects = useMemo(() => {
    if (!subjectSearch.trim()) return subjects;
    const term = subjectSearch.trim().toLowerCase();
    return subjects.filter((s) => s.name_ar.toLowerCase().includes(term));
  }, [subjects, subjectSearch]);

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
        academicYearId:defaultYear||undefined,priority:Number(defaultPriority),
        examYear: defaultExamYear ? parseInt(defaultExamYear, 10) : undefined,
        semester: defaultSemester ? parseInt(defaultSemester, 10) : undefined,
        doctorName: defaultDoctorName || undefined,
        examType: defaultExamType || undefined,
        notes: defaultNotes || undefined,
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
              // fallback
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

      if (!item.file.size || item.file.size <= 0) {
        updateItem(item.id, {
          status: "failed",
          errorMessage: "حجم الملف على جهازك 0 بايت (ملف فارغ). يرجى التأكد من الملف واختيار الملف المكتمل.",
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

      // Step 1: Initialize Upload Session
      try {
        if (!uploadId) {
          const initRes = await fetch("/api/admin/knowledge/upload/init", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: item.title,
              subjectId: item.subjectId,
              sourceType: item.sourceType,
              academicYearId:item.academicYearId,priority:item.priority,
              fileName: item.file.name,
              fileSize: item.file.size,
              mimeType: item.file.type || "application/octet-stream",
              totalChunks: item.totalChunks,
              examYear: item.examYear,
              semester: item.semester,
              doctorName: item.doctorName,
              examType: item.examType,
              notes: item.notes,
            }),
          });
          const initData = await initRes.json();
          if (!initRes.ok) {
            throw new Error(initData.error || "فشل بدء جلسة رفع الملف");
          }
          uploadId = initData.uploadId;
          updateItem(item.id, { uploadId });
        } else {
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

      // Step 2: Upload Chunks sequentially
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
        const currentItem = queueRef.current.find((q) => q.id === item.id);
        if (currentItem?.status === "cancelled") return;

        if (existingChunks.has(chunkIndex)) continue;

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
                  const currentSpeed = bytesDiff / timeDiffSec;
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
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }

      // Step 3: Complete upload assembly
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

      // Step 4: Background processing phase with polling
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

        // Poll document status until ready or failed
        let isDone = false;
        let attempts = 0;
        const maxAttempts = 180; // up to 6 minutes

        while (!isDone && attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 2000));
          attempts++;

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

  const startUploadAll = async () => {
    setIsProcessingQueue(true);
    const pendingItems = queueRef.current.filter(
      (q) => q.status === "pending" || q.status === "failed"
    );

    for (const item of pendingItems) {
      const current = queueRef.current.find((q) => q.id === item.id);
      if (!current || current.status === "cancelled" || current.status === "completed") {
        continue;
      }
      await processFileItem(current);
    }

    setIsProcessingQueue(false);
  };

  const totalFiles = queue.length;
  const completedFiles = queue.filter((q) => q.status === "completed").length;
  const totalBytesAll = queue.reduce((acc, q) => acc + q.file.size, 0);
  const uploadedBytesAll = queue.reduce((acc, q) => acc + q.uploadedBytes, 0);
  const overallPercent =
    totalBytesAll > 0 ? Math.min(100, Math.round((uploadedBytesAll / totalBytesAll) * 100)) : 0;

  const hasUploading = queue.some((q) => q.status === "uploading" || q.status === "processing");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="gap-2 shadow-sm font-medium px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground">
            <Upload className="size-4" />
            رفع مصادر تعليمية
          </Button>
        }
      />
      <DialogContent
        className="w-[95vw] sm:max-w-4xl md:max-w-5xl max-h-[92vh] flex flex-col p-0 overflow-hidden rounded-2xl border border-border shadow-lg bg-card"
        dir="rtl"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-border bg-muted/20 shrink-0">
          <DialogHeader className="text-right space-y-1.5">
            <DialogTitle className="text-lg sm:text-xl font-bold flex items-center gap-2.5 text-foreground">
              <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                <Sparkles className="size-5" />
              </span>
              رفع مصادر تدريبية وتعليمية (بدون حد للحجم)
            </DialogTitle>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              يدعم كتب ومراجع الـ PDF الكبيرة حتى 1GB+ عبر الرفع المجزأ والآمن (Chunked Streaming) دون استهلاك لذاكرة السيرفر.
            </p>
          </DialogHeader>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Controls bar: Subject & Source Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-muted/30 border border-border/80">
            {/* Subject Selector with embedded live filter */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <BookOpen className="size-3.5 text-indigo-500" />
                  المادة الدراسية (تحديد للملفات المرفوعة)
                </span>
                <span className="text-[11px] text-muted-foreground font-normal">
                  ({subjects.length} مادة معتمدة)
                </span>
              </Label>
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
                <SelectTrigger className="w-full bg-background text-xs sm:text-sm h-10 border-border shadow-xs">
                  <SelectValue placeholder="اختر المادة الدراسية">
                    {(val: string) => subjects.find((s) => s.id === val)?.name_ar}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-72 w-full min-w-[280px]">
                  {/* Search box inside dropdown */}
                  <div className="p-2 border-b border-border sticky top-0 bg-popover z-10">
                    <div className="relative">
                      <Search className="size-3.5 absolute right-2.5 top-2.5 text-muted-foreground" />
                      <Input
                        placeholder="ابحث بالاسم عن المادة..."
                        value={subjectSearch}
                        onChange={(e) => setSubjectSearch(e.target.value)}
                        className="h-8 text-xs pr-8 bg-background"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                  <div className="py-1">
                    {filteredSubjects.length > 0 ? (
                      filteredSubjects.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs sm:text-sm py-2">
                          {s.name_ar}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-3 text-xs text-center text-muted-foreground">
                        لا توجد مادة بهذا الاسم
                      </div>
                    )}
                  </div>
                </SelectContent>
              </Select>
            </div>

            {/* Source Type Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                نوع المصدر الافتراضي
              </Label>
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
                <SelectTrigger className="w-full bg-background text-xs sm:text-sm h-10 border-border shadow-xs">
                  <SelectValue>
                    {(val: string) => SOURCE_TYPES.find((t) => t.value === val)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-xs sm:text-sm py-2">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Optional Extended Metadata Toggle */}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs">السنة الدراسية<select className="mt-1 w-full rounded border bg-background p-2" value={defaultYear} onChange={event=>{
              setDefaultYear(event.target.value);setQueue(previous=>previous.map(item=>item.status==='pending'?{...item,academicYearId:event.target.value||undefined}:item));
            }}><option value="">كل السنوات المعيّنة للمادة</option>{academicYears.map(year=><option key={year.id} value={year.id}>{year.name_ar}</option>)}</select></label>
            <label className="text-xs">أولوية المصدر (0–100)<Input type="number" min={0} max={100} value={defaultPriority} onChange={event=>{
              setDefaultPriority(event.target.value);setQueue(previous=>previous.map(item=>item.status==='pending'?{...item,priority:Number(event.target.value)}:item));
            }}/></label>
          </div>
          <div className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-3">
            <button
              type="button"
              onClick={() => setShowAdvancedMeta(!showAdvancedMeta)}
              className="flex items-center justify-between w-full text-xs font-semibold text-primary hover:underline"
            >
              <span>معلومات إضافية / تفاصيل الامتحان والدكتور (اختياري)</span>
              <span>{showAdvancedMeta ? "▲ إخفاء" : "▼ إظهار"}</span>
            </button>

            {showAdvancedMeta && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div>
                  <Label className="text-[11px] text-muted-foreground block mb-1">سنة الامتحان</Label>
                  <Input
                    type="number"
                    min={2000}
                    max={2099}
                    placeholder="2025"
                    value={defaultExamYear}
                    onChange={(e) => setDefaultExamYear(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground block mb-1">الفصل الدراسي</Label>
                  <Select value={defaultSemester} onValueChange={(val) => { if (val) {setDefaultSemester(val);setQueue(previous=>previous.map(item=>item.status==='pending'?{...item,semester:Number(val)}:item));} }}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">الفصل الأول</SelectItem>
                      <SelectItem value="2">الفصل الثاني</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground block mb-1">اسم الدكتور/المحاضر</Label>
                  <Input
                    placeholder="د. أحمد"
                    value={defaultDoctorName}
                    onChange={(e) => setDefaultDoctorName(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground block mb-1">نوع الاختبار</Label>
                  <Select value={defaultExamType} onValueChange={(val) => { if (val) setDefaultExamType(val); }}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FINAL">نهائي (Final)</SelectItem>
                      <SelectItem value="MIDTERM">نصفي (Midterm)</SelectItem>
                      <SelectItem value="QUIZ">كويز (Quiz)</SelectItem>
                      <SelectItem value="PRACTICE">تدريبي (Practice)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 sm:col-span-4">
                  <Label className="text-[11px] text-muted-foreground block mb-1">ملاحظات توضيحية</Label>
                  <Input
                    placeholder="مثال: أسئلة شاملة لوحدة القلب والأوعية الدموية..."
                    value={defaultNotes}
                    onChange={(e) => setDefaultNotes(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Drag & Drop Area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border hover:border-primary/60 transition-colors duration-200 rounded-2xl p-7 text-center cursor-pointer bg-muted/10 hover:bg-primary/5 group"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.txt,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.md"
              className="hidden"
              onChange={handleFileSelect}
            />
            <div className="flex flex-col items-center justify-center gap-2.5">
              <div className="size-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
                <Upload className="size-7" />
              </div>
              <div>
                <p className="text-sm sm:text-base font-semibold text-foreground">
                  اضغط لاختيار ملف أو اسحب الملفات هنا
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  يدعم PDF، DOCX، PPTX، TXT — لا يوجد حد برمجي لحجم الملف للأدمن (50MB, 200MB, 1GB+)
                </p>
              </div>
            </div>
          </div>

          {/* Overall Multi-file Progress Banner */}
          {queue.length > 1 && (
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between text-xs sm:text-sm font-medium">
                <span className="flex items-center gap-2 text-primary font-semibold">
                  <FileText className="size-4" />
                  التقدم الإجمالي: {completedFiles} من {totalFiles} ملفات مكتملة
                </span>
                <span className="font-bold text-primary tabular-nums">
                  {formatBytes(uploadedBytesAll)} / {formatBytes(totalBytesAll)} ({overallPercent}%)
                </span>
              </div>
              <div className="w-full h-2.5 bg-primary/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${overallPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Queue List */}
          {queue.length > 0 && (
            <div className="space-y-3.5">
              <p className="text-xs font-semibold text-muted-foreground">الملفات المحددة ({queue.length}):</p>
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {queue.map((item) => {
                  const ext = item.file.name.split(".").pop()?.toUpperCase() || "FILE";
                  return (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl border border-border bg-card space-y-3 shadow-xs transition-all hover:border-border/90"
                    >
                      {/* Top Row: File icon, editable title, size, status */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          <div className="size-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                            {ext}
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            {item.status === "pending" ? (
                              <Input
                                value={item.title}
                                onChange={(e) => updateItem(item.id, { title: e.target.value })}
                                className="h-8 text-xs sm:text-sm font-medium bg-background"
                                placeholder="عنوان الملف في قاعدة المعرفة"
                              />
                            ) : (
                              <p className="text-sm font-semibold truncate text-foreground">
                                {item.title}
                              </p>
                            )}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="truncate max-w-[240px] sm:max-w-md">{item.file.name}</span>
                              <span>•</span>
                              <span className={`font-semibold tabular-nums ${item.file.size <= 0 ? "text-destructive" : "text-foreground"}`}>
                                {item.file.size <= 0 ? "0 بايت (ملف فارغ على جهازك)" : formatBytes(item.file.size)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Status Badges & Buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          {item.status === "pending" && (
                            <>
                              <span className="text-xs px-2.5 py-1 rounded-md bg-muted text-muted-foreground font-medium">
                                بانتظار الرفع
                              </span>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => removeItem(item.id)}
                                className="text-muted-foreground hover:text-destructive size-7"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </>
                          )}

                          {item.status === "uploading" && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => cancelUpload(item.id)}
                              className="h-8 text-xs gap-1.5 px-3"
                            >
                              <Ban className="size-3.5" />
                              إلغاء الرفع
                            </Button>
                          )}

                          {item.status === "processing" && (
                            <span className="text-xs px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium flex items-center gap-1.5 animate-pulse">
                              <Loader2 className="size-3.5 animate-spin" />
                              جارٍ المعالجة والتدريب...
                            </span>
                          )}

                          {item.status === "completed" && (
                            <span className="text-xs px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1.5">
                              <CheckCircle2 className="size-4" />
                              اكتمل بنجاح
                            </span>
                          )}

                          {item.status === "cancelled" && (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-500/10 text-slate-500 border border-slate-500/20 font-medium flex items-center gap-1.5">
                              <Ban className="size-3.5" />
                              تم الإلغاء
                            </span>
                          )}

                          {item.status === "failed" && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-2.5 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive/20 font-medium flex items-center gap-1.5">
                                <AlertCircle className="size-3.5" />
                                فشل
                              </span>
                              {item.file.size > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => processFileItem(item)}
                                >
                                  إعادة المحاولة
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Real Progress Bar & Live Telemetry */}
                      {(item.status === "uploading" || item.status === "processing" || item.status === "completed") && (
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-foreground text-sm tabular-nums">
                                {item.percent}%
                              </span>
                              <span className="text-muted-foreground tabular-nums">
                                {formatBytes(item.uploadedBytes)} / {formatBytes(item.file.size)}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-muted-foreground">
                              {item.status === "uploading" && item.speedMBs > 0 && (
                                <span className="flex items-center gap-1 font-medium text-sky-600 dark:text-sky-400 tabular-nums">
                                  <Zap className="size-3.5" />
                                  {item.speedMBs.toFixed(1)} MB/s
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Clock className="size-3.5" />
                                {item.etaText}
                              </span>
                            </div>
                          </div>

                          {/* Progress Track */}
                          <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden relative">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                item.status === "completed"
                                  ? "bg-emerald-500"
                                  : item.status === "processing"
                                  ? "bg-amber-500 animate-pulse"
                                  : "bg-gradient-to-r from-blue-600 via-indigo-600 to-primary"
                              }`}
                              style={{ width: `${item.percent}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Processing Notice Banner */}
                      {item.status === "processing" && (
                        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                          <Loader2 className="size-4 animate-spin shrink-0 text-amber-600" />
                          <div>
                            <p className="font-semibold text-sm">تم رفع الملف بنجاح ✓</p>
                            <p className="text-xs opacity-90 mt-0.5">
                              جارٍ تحليل واستخراج النص وتوليد التضمينات (Embeddings) للتدريب في الخلفية...
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Completed Notice Banner */}
                      {item.status === "completed" && (
                        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                          <p className="font-semibold text-xs sm:text-sm">
                            تم رفع وتجهيز الملف بالكامل وأصبح جاهزاً للاستخدام في تدريب الذكاء الاصطناعي والإجابة عن أسئلة الطلاب.
                          </p>
                        </div>
                      )}

                      {/* Error Banner */}
                      {item.status === "failed" && item.errorMessage && (
                        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-xs text-destructive">
                          <AlertCircle className="size-4 shrink-0" />
                          <p className="font-medium leading-relaxed">{item.errorMessage}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="p-4 sm:p-5 border-t border-border bg-muted/20 flex items-center justify-between shrink-0">
          <div className="text-xs text-muted-foreground font-medium">
            {queue.length > 0
              ? `${queue.length} ملفات في القائمة (${formatBytes(totalBytesAll)})`
              : "لم يتم اختيار أي ملف بعد"}
          </div>

          <div className="flex items-center gap-2.5">
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
              className="text-xs px-4 h-9"
            >
              إغلاق
            </Button>

            <Button
              onClick={startUploadAll}
              disabled={
                queue.length === 0 ||
                isProcessingQueue ||
                !queue.some((q) => (q.status === "pending" || q.status === "failed") && q.file.size > 0)
              }
              size="sm"
              className="gap-2 px-6 h-9 font-semibold shadow-sm"
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
      </DialogContent>
    </Dialog>
  );
}
