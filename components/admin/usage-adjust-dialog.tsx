"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { Gauge } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adjustStudentUsageAction, getStudentUsageAction, type UsageAdjustState } from "@/app/admin/actions";

const FEATURE_LABELS: Record<string, string> = {
  ai_questions_daily: "أسئلة AI اليومية",
  files_limit: "الملفات",
  images_limit: "الصور",
  quiz_limit: "الاختبارات",
  study_pack_limit: "حزم الدراسة",
};

type UsageRow = { key: string; used: number; limit: number; scope: string };

export function UsageAdjustDialog({ userId, studentName }: { userId: string; studentName: string }) {
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<UsageRow[] | null>(null);
  const [state, action, pending] = useActionState<UsageAdjustState, FormData>(adjustStudentUsageAction, {});
  const featureId = useId();
  const reasonId = useId();

  useEffect(() => {
    if (!open) return;
    let active = true;
    getStudentUsageAction(userId).then((rows) => { if (active) setUsage(rows); }).catch(() => { if (active) setUsage([]); });
    return () => { active = false; };
  }, [open, userId, state.success]);

  useEffect(() => {
    if (state.success) toast.success(`تم تعديل الاستخدام: ${state.success}`);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <>
      <Button variant="ghost" size="icon" className="size-11" aria-label={`تعديل استخدام ${studentName}`} onClick={() => setOpen(true)}>
        <Gauge className="size-4" aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إعادة تعيين الاستخدام</DialogTitle>
            <DialogDescription>
              يعيد العداد الفعلي الذي تتحقق منه الباقة إلى صفر للفترة الحالية. يبقى سجل الاستخدام كما هو، ويُسجَّل التعديل وسببه.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 rounded-lg border p-3 text-sm" aria-live="polite">
            {usage === null ? <li className="text-muted-foreground">جارٍ تحميل الاستخدام...</li>
              : usage.length === 0 ? <li className="text-muted-foreground">لا توجد حدود رقمية في باقة الطالب الحالية.</li>
              : usage.map((row) => (
                <li key={row.key} className="flex justify-between gap-3">
                  <span>{FEATURE_LABELS[row.key] ?? row.key}</span>
                  <bdi dir="ltr" className="tabular-nums">{row.used} / {row.limit}</bdi>
                </li>
              ))}
          </ul>
          <form action={action} className="space-y-3">
            <input type="hidden" name="userId" value={userId} />
            <div className="space-y-1.5">
              <label htmlFor={featureId} className="text-sm font-medium">الميزة</label>
              <select id={featureId} name="feature" defaultValue="ai_questions_daily" className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm">
                {Object.entries(FEATURE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                <option value="all">كل العدادات</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={reasonId} className="text-sm font-medium">السبب</label>
              <textarea id={reasonId} name="reason" required minLength={3} maxLength={300} rows={2}
                className="w-full rounded-xl border border-input bg-card p-3 text-sm" placeholder="مثال: خطأ تقني استهلك الحصة" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>إغلاق</Button>
              <Button type="submit" disabled={pending}>{pending ? "جارٍ الحفظ..." : "إعادة التعيين"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
