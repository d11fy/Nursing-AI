"use client";

import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  Award,
  Sparkles,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PracticeQuestionView } from "@/lib/exams/practice-service";

export function PracticeExamRunner({
  attemptId,
  mode,
  practiceType,
  questions,
  onClose,
}: {
  attemptId: string;
  mode: "STUDY" | "EXAM";
  practiceType: string;
  questions: PracticeQuestionView[];
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, unknown>>({});
  const [isAnswerRevealed, setIsAnswerRevealed] = useState<Record<string, boolean>>({});
  const [isCompleted, setIsCompleted] = useState(false);
  const [scoreSummary, setScoreSummary] = useState<{
    totalQuestions: number;
    correctAnswers: number;
    wrongAnswers: number;
    scorePercentage: number;
    weakTopicsRecommendation?: string[];
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const currentQ = questions[currentIndex];
  const selectedAnswer = currentQ ? userAnswers[currentQ.id] : undefined;
  const revealed = currentQ ? isAnswerRevealed[currentQ.id] : false;

  async function handleSelectOption(option: string) {
    if (!currentQ || (mode === "STUDY" && revealed)) return;

    setUserAnswers((prev) => ({ ...prev, [currentQ.id]: option }));

    // Check correctness
    const correctVal = String(currentQ.correctAnswer || "").trim().toLowerCase();
    const cleanOpt = option.trim().toLowerCase();
    // Handles options like "A) Option" where correctVal might be "A" or the text
    const isCorrect =
      cleanOpt === correctVal ||
      cleanOpt.startsWith(correctVal) ||
      (correctVal.length === 1 && cleanOpt.charAt(0) === correctVal);

    if (mode === "STUDY") {
      setIsAnswerRevealed((prev) => ({ ...prev, [currentQ.id]: true }));
      // Save answer immediately in study mode
      void fetch("/api/practice/submit-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId,
          questionId: currentQ.id,
          selectedAnswer: option,
          isCorrect,
          topic: currentQ.topic,
        }),
      });
    }
  }

  async function handleFinishExam() {
    setSubmitting(true);
    try {
      // In Exam Mode, submit all remaining answers
      if (mode === "EXAM") {
        for (const q of questions) {
          const ans = userAnswers[q.id];
          const correctVal = String(q.correctAnswer || "").trim().toLowerCase();
          const cleanOpt = String(ans || "").trim().toLowerCase();
          const isCorrect =
            Boolean(ans) &&
            (cleanOpt === correctVal ||
              cleanOpt.startsWith(correctVal) ||
              (correctVal.length === 1 && cleanOpt.charAt(0) === correctVal));

          await fetch("/api/practice/submit-answer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              attemptId,
              questionId: q.id,
              selectedAnswer: ans || null,
              isCorrect,
              topic: q.topic,
            }),
          });
        }
      }

      const res = await fetch("/api/practice/submit-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "COMPLETE", attemptId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل إنهاء الاختبار");

      setScoreSummary(data);
      setIsCompleted(true);
      toast.success("تم إنهاء الاختبار وحساب النتيجة وتحديث تقدمك!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setSubmitting(false);
    }
  }

  if (isCompleted && scoreSummary) {
    return (
      <Card className="max-w-2xl mx-auto border-border shadow-md">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto size-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-2">
            <Award className="size-7" />
          </div>
          <CardTitle className="text-xl font-bold">نتيجة الاختبار التدريبي</CardTitle>
          <p className="text-xs text-muted-foreground">تم تسجيل النتيجة وتحديث خطتك في ذاكرة التعلم</p>
        </CardHeader>
        <CardContent className="space-y-5 pt-3">
          <div className="text-center p-4 rounded-xl bg-muted/40 border">
            <span className="text-3xl font-extrabold text-foreground">{scoreSummary.scorePercentage}%</span>
            <div className="flex justify-center gap-6 mt-3 text-xs">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                صحيحة: {scoreSummary.correctAnswers}
              </span>
              <span className="text-rose-600 dark:text-rose-400 font-semibold">
                خاطئة: {scoreSummary.wrongAnswers}
              </span>
              <span className="text-muted-foreground">
                المجموع: {scoreSummary.totalQuestions}
              </span>
            </div>
          </div>

          {scoreSummary.weakTopicsRecommendation && scoreSummary.weakTopicsRecommendation.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1.5">
              <span className="font-bold text-amber-800 dark:text-amber-300 block">
                مواضيع تحتاج تركيز ومراجعة أكبر:
              </span>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                {scoreSummary.weakTopicsRecommendation.map((t, idx) => (
                  <li key={idx}>موضوع: <strong>{t}</strong></li>
                ))}
              </ul>
            </div>
          )}

          {/* Review Questions & Sources */}
          <div className="space-y-3 pt-2">
            <h4 className="text-sm font-bold text-foreground">مراجعة الإجابات والمصادر المعتمدة:</h4>
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {questions.map((q, idx) => {
                const ans = userAnswers[q.id];
                const correctVal = String(q.correctAnswer || "");
                return (
                  <div key={q.id} className="p-2.5 rounded-lg border bg-card text-xs space-y-1.5">
                    <p className="font-medium text-foreground">{idx + 1}. {q.questionText}</p>
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <span className="text-muted-foreground">إجابتك: {String(ans || "لم تُجب")}</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        الصحيحة: {correctVal}
                      </span>
                    </div>
                    {q.explanation && (
                      <p className="text-muted-foreground text-[11px] bg-muted/30 p-1.5 rounded">
                        {q.explanation}
                      </p>
                    )}
                    {q.sources.length > 0 && (
                      <div className="text-[10px] text-muted-foreground">
                        المصدر: {q.sources[0].documentTitle} {q.sources[0].pageNumber ? `(ص ${q.sources[0].pageNumber})` : ""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between border-t pt-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            إغلاق
          </Button>
          <Button size="sm" onClick={() => { setIsCompleted(false); setCurrentIndex(0); setUserAnswers({}); setIsAnswerRevealed({}); }}>
            <RotateCcw className="size-3.5 ml-1.5" />
            إعادة الاختبار
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (!currentQ) {
    return (
      <div className="text-center p-8 text-sm text-muted-foreground">
        لا توجد أسئلة متاحة في هذا الاختبار.
      </div>
    );
  }

  const isOptionSelected = (opt: string) => selectedAnswer === opt;
  const isOptionCorrect = (opt: string) => {
    const correctVal = String(currentQ.correctAnswer || "").trim().toLowerCase();
    const cleanOpt = opt.trim().toLowerCase();
    return cleanOpt === correctVal || cleanOpt.startsWith(correctVal) || (correctVal.length === 1 && cleanOpt.charAt(0) === correctVal);
  };

  return (
    <Card className="max-w-2xl mx-auto border-border shadow-md">
      <CardHeader className="flex flex-row items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            سؤال {currentIndex + 1} من {questions.length}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {currentQ.topic}
          </Badge>
          {currentQ.isPastExam && currentQ.examYear && (
            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-600/30">
              امتحان سابق {currentQ.examYear}
            </Badge>
          )}
        </div>
        <span className="text-xs font-semibold text-muted-foreground">
          {mode === "STUDY" ? "نمط الدراسة (عرض فوري)" : "نمط الاختبار"}
        </span>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {/* Question Text */}
        <p className="text-base font-semibold text-foreground leading-relaxed">
          {currentQ.questionText}
        </p>

        {/* Options */}
        <div className="space-y-2 pt-2">
          {currentQ.options.map((opt, i) => {
            const isSel = isOptionSelected(opt);
            const isCorr = isOptionCorrect(opt);

            let btnStyle = "border-border hover:bg-muted/40 text-foreground";
            if (mode === "STUDY" && revealed) {
              if (isCorr) {
                btnStyle = "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold";
              } else if (isSel && !isCorr) {
                btnStyle = "border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-300";
              }
            } else if (isSel) {
              btnStyle = "border-primary bg-primary/10 text-primary font-semibold";
            }

            return (
              <button
                key={i}
                type="button"
                onClick={() => handleSelectOption(opt)}
                className={`w-full text-right p-3 rounded-xl border text-sm transition-all flex items-center justify-between ${btnStyle}`}
              >
                <span>{opt}</span>
                {mode === "STUDY" && revealed && isCorr && (
                  <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mr-2" />
                )}
                {mode === "STUDY" && revealed && isSel && !isCorr && (
                  <XCircle className="size-4 text-rose-600 shrink-0 mr-2" />
                )}
              </button>
            );
          })}
        </div>

        {/* Study Mode: Immediate Explanation & Evidence */}
        {mode === "STUDY" && revealed && (
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border text-xs space-y-2 mt-4 animate-in fade-in duration-200">
            <div className="flex items-center gap-1.5 font-bold text-foreground">
              <BookOpen className="size-3.5 text-primary" />
              <span>الشرح والمصدر المعتمد:</span>
            </div>
            {currentQ.explanation && (
              <p className="text-foreground/90 leading-relaxed">{currentQ.explanation}</p>
            )}
            {currentQ.sources.length > 0 && (
              <div className="text-muted-foreground pt-1 border-t border-border/40 space-y-1">
                {currentQ.sources.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-foreground">
                      المصدر: {s.documentTitle} {s.pageNumber ? `(صفحة ${s.pageNumber})` : ""}
                    </span>
                    <Badge variant="outline" className="text-[10px]">{s.supportType}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between border-t pt-3">
        <Button
          variant="outline"
          size="sm"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((prev) => prev - 1)}
        >
          <ArrowRight className="size-4 ml-1" />
          السابق
        </Button>

        {currentIndex < questions.length - 1 ? (
          <Button
            size="sm"
            onClick={() => setCurrentIndex((prev) => prev + 1)}
          >
            التالي
            <ArrowLeft className="size-4 mr-1" />
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleFinishExam}
            disabled={submitting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {submitting ? "جارٍ الحساب..." : "إنهاء الاختبار وتأكيد النتيجة"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
