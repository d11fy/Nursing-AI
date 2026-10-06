"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { MistakeRecord } from "@/lib/learning-progress/types";

const statusLabel = { new: "جديد", reviewing: "قيد المراجعة", mastered: "تم إتقانه" } as const;

export function MistakeReviewCard({ mistake }: { mistake: MistakeRecord }) {
  const [expanded, setExpanded] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(mistake.status);
  const [result, setResult] = useState<{ isCorrect: boolean; status: string; correctAnswer: string } | null>(null);
  async function submit() {
    if (!answer) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/learning-progress/mistakes/${mistake.id}/review`, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentAnswer: answer }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر حفظ الإجابة");
      setResult(data); setCurrentStatus(data.status); toast.success(data.isCorrect ? "إجابة صحيحة—تم تحديث تقدمك" : "تم حفظ المحاولة للمراجعة");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ الإجابة"); }
    finally { setSubmitting(false); }
  }
  return <Card className="border-border">
    <CardHeader className="gap-3">
      <div className="flex flex-wrap items-center gap-2"><Badge variant={currentStatus === "mastered" ? "default" : "outline"}>{statusLabel[currentStatus]}</Badge>
        <Badge variant="secondary"><bdi dir="auto">{mistake.topic}</bdi></Badge><span className="text-xs text-muted-foreground">تكرر {mistake.wrongCount}×</span></div>
      <CardTitle dir="auto" className="break-words text-base leading-7 [unicode-bidi:plaintext]">{mistake.question}</CardTitle>
      <p className="text-xs text-muted-foreground"><bdi dir="auto">{mistake.subjectName}</bdi>{mistake.studyPackTitle ? <> · <bdi dir="auto">{mistake.studyPackTitle}</bdi></> : null}</p>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-amber-500/8 p-3"><span className="text-xs text-muted-foreground">إجابتك</span><p dir="auto" className="mt-1 break-words font-semibold [unicode-bidi:plaintext]">{mistake.studentAnswer}</p></div>
        <div className="rounded-xl bg-emerald-500/8 p-3"><span className="text-xs text-muted-foreground">الإجابة الصحيحة</span><p dir="auto" className="mt-1 break-words font-semibold [unicode-bidi:plaintext]">{mistake.correctAnswer}</p></div></div>
      {expanded && <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">{mistake.rationale && <div><span className="text-xs font-bold">التفسير</span><p dir="auto" className="mt-1 break-words text-sm leading-7 [unicode-bidi:plaintext]">{mistake.rationale}</p></div>}{mistake.sourceReference && <p className="text-xs text-muted-foreground">المصدر: <bdi dir="auto">{mistake.sourceReference}</bdi></p>}</div>}
      {reviewing && <div className="space-y-3 rounded-xl border border-primary/20 p-4"><p className="text-sm font-bold">أجب مرة أخرى</p>
        {mistake.options.length ? <div className="grid gap-2">{mistake.options.map((option) => <button key={option} type="button" onClick={() => setAnswer(option)} className={`min-h-11 rounded-xl border px-3 py-2 text-start text-sm ${answer === option ? "border-primary bg-primary/8" : "border-border bg-card"}`}><bdi dir="auto">{option}</bdi></button>)}</div> : <input value={answer} onChange={(event) => setAnswer(event.target.value)} className="min-h-11 w-full rounded-xl border border-input bg-card px-3" />}
        <Button onClick={submit} disabled={!answer || submitting} className="w-full sm:w-auto">{submitting && <Loader2 className="size-4 animate-spin" />}تحقق من الإجابة</Button>
        {result && <div className={`flex items-start gap-2 rounded-xl p-3 text-sm ${result.isCorrect ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-800"}`}>{result.isCorrect ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}<span>{result.isCorrect ? "صحيح. تحتاج إجابة صحيحة أخرى في مراجعة لاحقة للوصول إلى الإتقان." : <>ليست صحيحة. الإجابة: <bdi dir="auto">{result.correctAnswer}</bdi></>}</span></div>}
      </div>}
    </CardContent>
    <CardFooter className="grid grid-cols-1 gap-2 sm:flex"><Button variant="ghost" onClick={() => setExpanded((value) => !value)} className="w-full sm:w-auto"><ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} />{expanded ? "إخفاء التفاصيل" : "عرض التفسير والمصدر"}</Button>
      <Button variant="outline" onClick={() => { setReviewing((value) => !value); setResult(null); }} className="w-full sm:ms-auto sm:w-auto"><RotateCcw className="size-4" />راجع السؤال</Button></CardFooter>
  </Card>;
}
