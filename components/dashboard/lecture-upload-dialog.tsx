"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

const ACCEPTED_EXTENSIONS = ["pdf", "docx", "pptx", "txt", "jpg", "jpeg", "png", "webp"];

function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

function uploadWithProgress(formData: FormData, onProgress: (pct: number) => void): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/lectures");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        resolve({ status: xhr.status, data: JSON.parse(xhr.responseText || "{}") });
      } catch {
        reject(new Error("استجابة غير صالحة من الخادم"));
      }
    };
    xhr.onerror = () => reject(new Error("تعذر رفع الملف. حاول مرة أخرى."));
    xhr.send(formData);
  });
}

export function LectureUploadDialog({
  subjectId,
  largeFileMb,
  maxFileMb,
}: {
  subjectId: string;
  largeFileMb: number;
  maxFileMb: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [largeFileAck, setLargeFileAck] = useState(false);
  const [contributionConsent, setContributionConsent] = useState(false);
  const [contributionOwnership, setContributionOwnership] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; title: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLarge = file ? file.size > largeFileMb * 1024 * 1024 : false;
  const uploading = progress !== null;

  function pickFile(picked: File | null) {
    if (!picked) return;
    const ext = picked.name.split(".").pop()?.toLowerCase();
    if (!ext || !ACCEPTED_EXTENSIONS.includes(ext)) {
      toast.error("نوع الملف غير مدعوم");
      return;
    }
    if (picked.size > maxFileMb * 1024 * 1024) {
      toast.error(`حجم الملف أكبر من الحد المسموح. الحد الأقصى ${maxFileMb}MB.`);
      return;
    }
    setFile(picked);
    setDuplicate(null);
    setLargeFileAck(false);
    if (!title.trim()) setTitle(picked.name.replace(/\.[^.]+$/, ""));
  }

  function reset() {
    setFile(null);
    setTitle("");
    setLargeFileAck(false);
    setContributionConsent(false);
    setContributionOwnership(false);
    setProgress(null);
    setDuplicate(null);
  }

  async function submit(forceDuplicate = false) {
    if (!file || !title.trim()) {
      toast.error("الرجاء اختيار ملف وإدخال اسم المحاضرة");
      return;
    }
    if (isLarge && !largeFileAck) {
      toast.error("الرجاء تأكيد الاطلاع على تنبيه التخزين");
      return;
    }
    setProgress(0);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title.trim());
      formData.append("subjectId", subjectId);
      formData.append("largeFileAcknowledged", String(largeFileAck));
      formData.append("contributionConsent", String(contributionConsent));
      formData.append("contributionOwnershipConfirmed", String(contributionOwnership));
      formData.append("forceDuplicate", String(forceDuplicate));

      const { status, data } = await uploadWithProgress(formData, setProgress);

      if (status === 409 && data.duplicate) {
        setDuplicate({ id: String(data.existingLectureId), title: String(data.existingTitle) });
        setProgress(null);
        return;
      }
      if (status < 200 || status >= 300) {
        throw new Error(typeof data.error === "string" ? data.error : "تعذر رفع الملف");
      }

      toast.success("تم رفع المحاضرة، جارٍ تجهيزها للدراسة");
      setOpen(false);
      reset();
      router.push(`/dashboard/subjects/${subjectId}/lectures/${data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر رفع الملف");
      setProgress(null);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files?.[0] ?? null);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger render={<Button><Upload className="size-4" />رفع محاضرة</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>رفع محاضرة جديدة</DialogTitle>
        </DialogHeader>

        {duplicate ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              يبدو أنك رفعت هذه المحاضرة مسبقًا باسم «{duplicate.title}».
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setOpen(false); router.push(`/dashboard/subjects/${subjectId}/lectures/${duplicate.id}`); }}
              >
                فتح النسخة الموجودة
              </Button>
              <Button className="flex-1" onClick={() => submit(true)} disabled={uploading}>
                رفع نسخة جديدة على أي حال
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="lecture-title">اسم المحاضرة</Label>
              <Input
                id="lecture-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: Heart Failure - Lecture 4"
                disabled={uploading}
              />
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center text-sm transition-colors ${
                dragging ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.pptx,.txt,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                disabled={uploading}
              />
              {file ? (
                <div className="flex w-full items-center justify-between gap-2 text-right">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="size-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
                    </div>
                  </div>
                  {!uploading && (
                    <button onClick={(e) => { e.stopPropagation(); setFile(null); }} aria-label="إزالة الملف">
                      <X className="size-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <Upload className="size-6 text-muted-foreground" />
                  <p>اسحب الملف هنا أو اضغط للاختيار</p>
                  <p className="text-xs text-muted-foreground">PDF, DOCX, PPTX, TXT, JPG, PNG, WEBP — حتى {maxFileMb}MB</p>
                </>
              )}
            </div>

            {isLarge && (
              <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <p className="font-medium">تنبيه بخصوص التخزين</p>
                <p>
                  هذا الملف أكبر من {largeFileMb}MB، لذلك سيتم حذف الملف الأصلي تلقائيًا من خوادمنا بعد {" "}
                  عشرة أيام لتقليل استهلاك التخزين. المحتوى الدراسي المُنشأ منه مثل الملخص أو الأسئلة سيبقى
                  متاحًا ما لم يتم حذف المحاضرة بالكامل.
                </p>
                <label className="flex cursor-pointer items-start gap-2 pt-1">
                  <Checkbox checked={largeFileAck} onCheckedChange={(v) => setLargeFileAck(v === true)} />
                  <span>فهمت أن الملف الأصلي سيتم حذفه تلقائيًا بعد 10 أيام.</span>
                </label>
              </div>
            )}

            <div className="space-y-2 rounded-lg border border-border p-3 text-xs">
              <label className="flex cursor-pointer items-start gap-2">
                <Checkbox checked={contributionConsent} onCheckedChange={(v) => setContributionConsent(v === true)} />
                <span>أسمح باستخدام المحتوى التعليمي في هذا الملف لتحسين قاعدة المعرفة التمريضية المشتركة في Nursing AI.</span>
              </label>
              <p className="text-muted-foreground">
                اختيارك اختياري تمامًا ولن يؤثر على استخدامك للمحاضرة. لن يتم استخدام الملف في المعرفة المشتركة بدون موافقتك.
              </p>
              {contributionConsent && (
                <label className="flex cursor-pointer items-start gap-2 border-t border-border pt-2">
                  <Checkbox checked={contributionOwnership} onCheckedChange={(v) => setContributionOwnership(v === true)} />
                  <span>أؤكد أن لدي الحق في مشاركة هذا المحتوى، وأنه لا يحتوي على بيانات شخصية أو طبية خاصة بأشخاص آخرين.</span>
                </label>
              )}
            </div>

            {uploading && (
              <div className="space-y-1">
                <Progress value={progress ?? 0}>
                  <ProgressTrack>
                    <ProgressIndicator />
                  </ProgressTrack>
                </Progress>
                <p className="text-xs text-muted-foreground">رفع الملف... {progress}%</p>
              </div>
            )}

            <DialogFooter>
              <Button
                onClick={() => submit(false)}
                disabled={uploading || !file || !title.trim() || (contributionConsent && !contributionOwnership)}
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : null}
                رفع ومعالجة المحاضرة
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
