"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { LectureStatus } from "@/types/database";

const PROCESSING_LABEL: Partial<Record<LectureStatus, string>> = {
  uploading: "رفع الملف...",
  uploaded: "جاري معالجة المحاضرة...",
  processing: "جاري تجهيزها للدراسة...",
};

export function LectureStatusBanner({
  lectureId,
  status: initialStatus,
  errorMessage,
}: {
  lectureId: string;
  status: LectureStatus;
  errorMessage: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (status === "ready" || status === "failed") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/lectures/${lectureId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status && data.status !== status) {
          setStatus(data.status);
          if (data.status === "ready" || data.status === "failed") router.refresh();
        }
      } catch {
        // Transient network error — the next tick retries.
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [status, lectureId, router]);

  async function retry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/lectures/${lectureId}/retry`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر إعادة المحاولة");
      setStatus("uploaded");
      toast.success("جارٍ إعادة المعالجة");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر إعادة المحاولة");
    } finally {
      setRetrying(false);
    }
  }

  if (status === "ready") return null;

  if (status === "failed") {
    return (
      <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm font-medium text-destructive">تعذر تجهيز المحاضرة. يمكنك إعادة المحاولة.</p>
        {errorMessage && <p className="text-xs text-muted-foreground">{errorMessage}</p>}
        <Button onClick={retry} disabled={retrying} variant="outline">
          {retrying ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          إعادة المعالجة
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      {PROCESSING_LABEL[status] ?? "جارٍ التجهيز..."}
    </div>
  );
}
