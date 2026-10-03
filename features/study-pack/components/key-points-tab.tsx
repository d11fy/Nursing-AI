"use client";

import { useState } from "react";
import {
  Sparkles,
  Loader2,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Lightbulb,
  Brain,
  Award,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { KeyPointsContent, GenerationStatus } from "../types";

const CATEGORY_MAP: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; badgeClass: string }
> = {
  must_understand: {
    label: "يجب فهمه (Must Understand)",
    icon: Brain,
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  },
  must_memorize: {
    label: "يجب حفظه (Must Memorize)",
    icon: Lightbulb,
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  },
  exam_focus: {
    label: "نقطة مهمة للمحاضرة (Exam Focus)",
    icon: Award,
    badgeClass: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  },
  high_yield: {
    label: "مفهوم عالي الأهمية (High Yield)",
    icon: Zap,
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  },
};

export function KeyPointsTab({
  studyPackId,
  initialContent,
  initialStatus,
}: {
  studyPackId: string;
  initialContent?: KeyPointsContent | null;
  initialStatus: GenerationStatus;
}) {
  const [content, setContent] = useState<KeyPointsContent | null>(initialContent ?? null);
  const [status, setStatus] = useState<GenerationStatus>(initialStatus);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleGenerate(isRegenerate = false) {
    setLoading(true);
    setStatus("generating");
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/study-packs/${studyPackId}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "key_points", regenerate: isRegenerate }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "تعذر استخراج أهم النقاط، حاول مرة أخرى");
      }

      setContent(data.content);
      setStatus("ready");
      toast.success(isRegenerate ? "تمت إعادة استخراج النقاط بنجاح" : "تم استخراج أهم النقاط بنجاح");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "حدث خطأ أثناء استخراج النقاط";
      setStatus("failed");
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  // 1. Loading State
  if (loading || status === "generating") {
    return (
      <Card className="border-border p-8">
        <div className="flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto">
          <div className="relative">
            <div className="size-12 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin" />
            <Sparkles className="size-5 text-amber-500 absolute inset-0 m-auto" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-foreground">جارٍ استخراج أهم النقاط...</h3>
            <p className="text-xs text-muted-foreground">
              يتم مسح وتصنيف النقاط الأساسية والمفاهيم عالية الأهمية عبر أقسام المحاضرة.
            </p>
          </div>
          <div className="w-full space-y-3 pt-4">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        </div>
      </Card>
    );
  }

  // 2. Error State
  if (status === "failed") {
    return (
      <Card className="border-destructive/30 bg-destructive/5 p-8 text-center space-y-4">
        <div className="size-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
          <AlertCircle className="size-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-foreground">تعذر استخراج أهم النقاط</h3>
          <p className="text-xs text-muted-foreground">{errorMessage || "حدث خطأ غير متوقع."}</p>
        </div>
        <Button onClick={() => handleGenerate(false)} variant="default" size="sm" className="gap-2">
          <RotateCcw className="size-4" />
          إعادة المحاولة
        </Button>
      </Card>
    );
  }

  // 3. Empty State
  if (!content || status === "not_generated") {
    return (
      <Card className="border-dashed border-2 border-border p-12 text-center">
        <div className="flex flex-col items-center justify-center max-w-md mx-auto space-y-4">
          <div className="size-12 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center">
            <Sparkles className="size-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-foreground">لم يتم استخراج أهم النقاط بعد</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              استخرج خلاصات مركزة مصنفة حسب الأولوية: ما يجب فهمه سريريًا، ما يجب حفظه، والمفاهيم الأهم للمراجعة السريعة.
            </p>
          </div>
          <Button onClick={() => handleGenerate(false)} size="default" className="gap-2 bg-amber-600 hover:bg-amber-700">
            <Sparkles className="size-4" />
            استخراج أهم النقاط الآن
          </Button>
        </div>
      </Card>
    );
  }

  // 4. Ready State
  return (
    <div className="space-y-5">
      {/* Top action header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-border bg-card shadow-2xs">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 text-xs">
            <CheckCircle2 className="size-3 text-green-500" />
            {content.points.length} نقاط مركزة
          </Badge>
          <span className="text-xs text-muted-foreground">
            مستخرجة من كافة أقسام المحاضرة
          </span>
        </div>

        {/* Regenerate confirmation */}
        <AlertDialog>
          <AlertDialogTrigger render={
            <Button variant="outline" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <RotateCcw className="size-3.5" />
              إعادة استخراج النقاط
            </Button>
          } />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>إعادة استخراج النقاط؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيتم استدعاء الذكاء الاصطناعي مجددًا وتحديث القائمة الحالية. هل تود المتابعة؟
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleGenerate(true)}>
                تأكيد الاستخراج
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Points List */}
      <div className="grid gap-3">
        {content.points.map((pt, idx) => {
          const config = CATEGORY_MAP[pt.category] || CATEGORY_MAP.high_yield;
          const IconComp = config.icon;

          return (
            <Card key={idx} className="border-border shadow-2xs hover:border-primary/40 transition-colors">
              <CardContent className="p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="outline" className={`text-[11px] font-semibold flex items-center gap-1 ${config.badgeClass}`}>
                    <IconComp className="size-3" />
                    {config.label}
                  </Badge>
                  {pt.source_reference && (
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {pt.source_reference}
                    </span>
                  )}
                </div>

                <p dir="auto" className="text-xs sm:text-sm font-medium leading-relaxed text-foreground [unicode-bidi:plaintext]">
                  {pt.point}
                </p>

                {pt.arabic_clarification && (
                  <div className="rounded-lg bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">توضيح: </span>
                    <span dir="auto" className="[unicode-bidi:plaintext]">{pt.arabic_clarification}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
