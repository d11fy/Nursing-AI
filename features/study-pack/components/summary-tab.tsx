"use client";

import { useState } from "react";
import {
  FileText,
  Sparkles,
  RotateCcw,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Stethoscope,
  BookmarkCheck,
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
import type { SummaryContent, GenerationStatus } from "../types";
import { coverageLabel } from "../services/coverage";

export function SummaryTab({
  studyPackId,
  initialContent,
  initialStatus,
}: {
  studyPackId: string;
  initialContent?: SummaryContent | null;
  initialStatus: GenerationStatus;
}) {
  const [content, setContent] = useState<SummaryContent | null>(initialContent ?? null);
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
        body: JSON.stringify({ type: "summary", regenerate: isRegenerate }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "تعذر إنشاء الملخص، يرجى المحاولة لاحقًا");
      }

      setContent(data.content);
      setStatus("ready");
      toast.success(isRegenerate ? "تمت إعادة إنشاء الملخص بنجاح" : "تم إنشاء الملخص بنجاح");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "حدث خطأ أثناء إنشاء الملخص";
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
            <div className="size-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <Sparkles className="size-5 text-primary absolute inset-0 m-auto" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-foreground">جارٍ إعداد الملخص الذكي...</h3>
            <p className="text-xs text-muted-foreground">
              يقوم المعلم الذكي بقراءة واستيعاب محتوى المحاضرة واستخراج المفاهيم السريرية والمصطلحات الطبية.
            </p>
          </div>
          <div className="w-full space-y-2 pt-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-20 w-full rounded-xl" />
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
          <h3 className="text-base font-bold text-foreground">حدث خطأ أثناء إنشاء الملخص</h3>
          <p className="text-xs text-muted-foreground">{errorMessage || "تعذر إكمال التوليد بنجاح."}</p>
        </div>
        <Button onClick={() => handleGenerate(false)} variant="default" size="sm" className="gap-2">
          <RotateCcw className="size-4" />
          إعادة المحاولة
        </Button>
      </Card>
    );
  }

  // 3. Empty State (Not generated yet)
  if (!content || status === "not_generated") {
    return (
      <Card className="border-dashed border-2 border-border p-12 text-center">
        <div className="flex flex-col items-center justify-center max-w-md mx-auto space-y-4">
          <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <FileText className="size-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-foreground">لم يتم إنشاء الملخص بعد</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              انقر على الزر أدناه لتوليد ملخص تمريضي منظم يركز على المفاهيم الأساسية، المصطلحات الطبية مع ترجمتها، والنقاط السريرية المهمة.
            </p>
          </div>
          <Button onClick={() => handleGenerate(false)} size="default" className="gap-2">
            <Sparkles className="size-4" />
            إنشاء الملخص الآن
          </Button>
        </div>
      </Card>
    );
  }

  // 4. Ready State (Summary Content Rendered)
  return (
    <div className="space-y-5">
      {/* Top action header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-border bg-card shadow-2xs">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 text-xs">
            <CheckCircle2 className="size-3 text-green-500" />
            الملخص جاهز
          </Badge>
          <span className="text-xs text-muted-foreground">
            {coverageLabel(content.coverage)}
          </span>
        </div>

        {/* Regenerate with Confirmation Dialog */}
        <AlertDialog>
          <AlertDialogTrigger render={
            <Button variant="outline" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <RotateCcw className="size-3.5" />
              إعادة إنشاء الملخص
            </Button>
          } />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>إعادة إنشاء الملخص؟</AlertDialogTitle>
              <AlertDialogDescription>
                توليد الملخص مجددًا سيعيد استدعاء الذكاء الاصطناعي ويستهلك وحدات (Tokens). هل تريد المتابعة واستبدال الملخص الحالي؟
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleGenerate(true)}>
                تأكيد وإعادة التوليد
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* 1. Overview */}
      <Card className="border-border shadow-xs">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
            <BookOpen className="size-4 text-primary" />
            نظرة عامة على المحاضرة (Overview)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <p dir="auto" className="text-sm leading-relaxed text-foreground [unicode-bidi:plaintext]">
            {content.overview}
          </p>
        </CardContent>
      </Card>

      {/* 2. Main Concepts */}
      {content.main_concepts && content.main_concepts.length > 0 && (
        <Card className="border-border shadow-xs">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
              <Sparkles className="size-4 text-primary" />
              المفاهيم الأساسية (Main Concepts)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-3">
            {content.main_concepts.map((item, idx) => (
              <div key={idx} className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span dir="ltr" className="font-bold text-sm text-foreground font-mono">
                    {item.concept}
                  </span>
                  {item.arabic_term && (
                    <Badge variant="outline" className="text-xs bg-card border-border font-medium">
                      {item.arabic_term}
                    </Badge>
                  )}
                </div>
                <p dir="auto" className="text-xs leading-relaxed text-muted-foreground [unicode-bidi:plaintext]">
                  {item.explanation}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 3. Important Definitions / Terminology */}
      {content.important_definitions && content.important_definitions.length > 0 && (
        <Card className="border-border shadow-xs">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
              <HelpCircle className="size-4 text-amber-500" />
              المصطلحات الطبية والتعريفات (Medical Terminology)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {content.important_definitions.map((def, idx) => (
                <div key={idx} className="rounded-xl border border-border p-3 bg-card space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span dir="ltr" className="font-bold text-xs text-foreground font-mono">
                      {def.term}
                    </span>
                    <span className="text-xs font-semibold text-primary">
                      {def.arabic_translation}
                    </span>
                  </div>
                  <p dir="auto" className="text-[11px] leading-relaxed text-muted-foreground [unicode-bidi:plaintext]">
                    {def.definition}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 4. Clinical Notes */}
      {content.clinical_notes && content.clinical_notes.length > 0 && (
        <Card className="border-blue-500/20 bg-blue-500/5 shadow-xs">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-blue-900 dark:text-blue-200">
              <Stethoscope className="size-4 text-blue-600 dark:text-blue-400" />
              ملاحظات وتطبيقات سريرية (Clinical Notes)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-2">
            {content.clinical_notes.map((note, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs leading-relaxed text-foreground">
                <span className="size-1.5 rounded-full bg-blue-500 shrink-0 mt-2" />
                <div className="space-y-0.5">
                  <span dir="auto" className="[unicode-bidi:plaintext]">{note.note}</span>
                  {note.importance && (
                    <span className="block text-[11px] text-muted-foreground font-medium">
                      الأهمية: {note.importance}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 5. What to Remember */}
      {content.what_to_remember && content.what_to_remember.length > 0 && (
        <Card className="border-border shadow-xs">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
              <BookmarkCheck className="size-4 text-green-500" />
              نقاط لا تنساها (What to Remember)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-2">
            <ul className="list-inside list-disc space-y-1.5 text-xs text-foreground leading-relaxed">
              {content.what_to_remember.map((point, idx) => (
                <li key={idx} dir="auto" className="[unicode-bidi:plaintext]">
                  {point}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
