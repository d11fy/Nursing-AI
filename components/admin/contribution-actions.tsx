"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ContributionActions({ contributionId }: { contributionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  function act(action: "approve" | "reject") {
    startTransition(async () => {
      const res = await fetch(`/api/admin/knowledge/contributions/${contributionId}/${action}`, { method: "POST" });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (res.ok) {
        toast.success(action === "approve" ? "تمت الموافقة وإضافة المحتوى للمعرفة المشتركة" : "تم رفض المساهمة");
        router.refresh();
      } else {
        toast.error(data.error || "تعذر تنفيذ العملية، حاول مرة أخرى");
      }
    });
  }

  async function openPreview() {
    setPreviewOpen(true);
    setLoadingPreview(true);
    try {
      const res = await fetch(`/api/admin/knowledge/contributions/${contributionId}/preview`);
      const data = await res.json();
      setPreview(res.ok ? data.preview : "تعذر تحميل المعاينة");
    } finally {
      setLoadingPreview(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="size-8" onClick={openPreview} disabled={isPending} aria-label="معاينة النص">
        <Eye className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" className="size-8 text-green-600" onClick={() => act("approve")} disabled={isPending} aria-label="قبول">
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
      </Button>
      <Button variant="ghost" size="icon" className="size-8 text-red-600" onClick={() => act("reject")} disabled={isPending} aria-label="رفض">
        <X className="size-4" />
      </Button>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[70vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>معاينة النص المستخرج</DialogTitle>
          </DialogHeader>
          {loadingPreview ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{preview}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
