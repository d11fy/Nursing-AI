"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const REASONS = [
  { value: "unclear", label: "الإجابة غير واضحة" },
  { value: "inaccurate", label: "معلومة غير دقيقة" },
  { value: "too_long", label: "الإجابة طويلة" },
  { value: "missed_question", label: "لم يفهم السؤال" },
  { value: "other", label: "أخرى" },
] as const;

export function FeedbackDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string, comment?: string) => void;
}) {
  const [reason, setReason] = useState<string>("");
  const [comment, setComment] = useState("");

  function submit() {
    if (!reason) return;
    onSubmit(reason, comment || undefined);
    onOpenChange(false);
    setReason("");
    setComment("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ما سبب عدم رضاك عن الإجابة؟</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {REASONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setReason(r.value)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm transition",
                reason === r.value
                  ? "border-primary bg-accent text-primary"
                  : "border-border hover:bg-muted"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        <Textarea
          placeholder="تفاصيل إضافية (اختياري)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
        />

        <DialogFooter>
          <Button onClick={submit} disabled={!reason}>
            إرسال
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
