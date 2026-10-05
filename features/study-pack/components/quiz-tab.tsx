"use client";

import { useState, useEffect } from "react";
import {
  HelpCircle,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  Award,
  AlertTriangle,
  Play,
  Layers,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { QuizItem, QuizQuestionItem, QuizDifficulty, StudentMistakeItem } from "../types";

export function QuizTab({
  studyPackId,
  initialQuiz,
}: {
  studyPackId: string;
  initialQuiz?: QuizItem | null;
}) {
  const [quiz, setQuiz] = useState<QuizItem | null>(initialQuiz ?? null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(!initialQuiz);

  // Quiz Configuration State
  const [showConfig, setShowConfig] = useState(!initialQuiz);
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("medium");
  const [questionType, setQuestionType] = useState<"mcq" | "true_false" | "mixed">("mixed");

  // Active Runner State
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [completionSummary, setCompletionSummary] = useState<{
    score: number;
    correctCount: number;
    totalQuestions: number;
    missedTopics: string[];
  } | null>(null);

  // Review Mistakes Mode
  const [mistakesMode, setMistakesMode] = useState(false);
  const [mistakes, setMistakes] = useState<StudentMistakeItem[]>([]);
  const [mistakeIndex, setMistakeIndex] = useState(0);
  const [loadingMistakes, setLoadingMistakes] = useState(false);

  // Load existing quiz if not supplied
  useEffect(() => {
    if (!quiz && !initialQuiz) {
      fetch(`/api/study-packs/${studyPackId}/quiz`)
        .then((res) => res.json())
        .then((data) => {
          if (data.quiz && data.quiz.questions?.length > 0) {
            setQuiz(data.quiz);
            setShowConfig(false);
          }
        })
        .catch(() => {})
        .finally(() => setFetching(false));
    }
  }, [studyPackId, quiz, initialQuiz]);

  // Start / Generate Quiz
  async function handleGenerateQuiz(regenerate = false) {
    setLoading(true);
    try {
      const res = await fetch(`/api/study-packs/${studyPackId}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionCount,
          difficulty,
          questionType,
          regenerate,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "تعذر توليد الاختبار");

      setQuiz(data.quiz);
      setShowConfig(false);
      await startRunner(data.quiz.id);
      toast.success("تم تجهيز الاختبار بنجاح، بالتوفيق!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ أثناء إعداد الاختبار");
    } finally {
      setLoading(false);
    }
  }

  // Start Attempt Runner
  async function startRunner(quizId: string) {
    try {
      const res = await fetch(`/api/study-packs/${studyPackId}/quiz/attempt?action=start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setAttemptId(data.id);
      }
    } catch {
      // Continue anyway with local attempt
    }

    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setRevealed(false);
    setIsCompleted(false);
    setCompletionSummary(null);
    setMistakesMode(false);
  }

  // Submit Answer
  async function handleSelectOption(option: string) {
    if (revealed || submittingAnswer) return;

    setSelectedAnswer(option);
    setRevealed(true);
    setSubmittingAnswer(true);

    const activeQuestion = quiz?.questions[currentQuestionIndex];
    if (activeQuestion && attemptId) {
      try {
        await fetch(`/api/study-packs/${studyPackId}/quiz/attempt?action=answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attemptId,
            questionId: activeQuestion.id,
            studentAnswer: option,
          }),
        });
      } catch {
        // Ignored
      } finally {
        setSubmittingAnswer(false);
      }
    } else {
      setSubmittingAnswer(false);
    }
  }

  // Next Question or Finish
  async function handleNextQuestion() {
    if (!quiz) return;

    if (currentQuestionIndex < quiz.questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setSelectedAnswer(null);
      setRevealed(false);
    } else {
      // Complete attempt
      if (attemptId) {
        try {
          const res = await fetch(`/api/study-packs/${studyPackId}/quiz/attempt?action=complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attemptId }),
          });
          const summary = await res.json();
          if (res.ok) {
            setCompletionSummary(summary);
          }
        } catch {
          // Ignored
        }
      }
      setIsCompleted(true);
    }
  }

  // Load Review Mistakes
  async function handleReviewMistakes() {
    setLoadingMistakes(true);
    try {
      const url = attemptId
        ? `/api/study-packs/${studyPackId}/quiz/mistakes?attemptId=${attemptId}`
        : `/api/study-packs/${studyPackId}/quiz/mistakes`;

      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر جلب الأخطاء");

      if (!data.mistakes || data.mistakes.length === 0) {
        toast.info("لا توجد أخطاء مسجلة لمراجعتها في هذا الاختبار!");
        return;
      }

      setMistakes(data.mistakes);
      setMistakeIndex(0);
      setMistakesMode(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر جلب الأخطاء");
    } finally {
      setLoadingMistakes(false);
    }
  }

  // 1. Loading State
  if (loading || fetching) {
    return (
      <Card className="border-border p-12 text-center">
        <div className="flex flex-col items-center justify-center space-y-4 max-w-md mx-auto">
          <Loader2 className="size-8 text-primary animate-spin" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-foreground">
              {loading ? "جارٍ إعداد وتوليد أسئلة الاختبار..." : "تحميل الاختبار..."}
            </h3>
            <p className="text-xs text-muted-foreground">
              يتم استخراج أسئلة دقيقة من المحاضرة وبناء شروحات تعليمية لكل إجابة.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // 2. Configuration State (Before generation or clicking New Quiz)
  if (showConfig || !quiz) {
    return (
      <Card className="border-border shadow-xs max-w-xl mx-auto">
        <CardHeader className="text-center pb-2">
          <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-2">
            <HelpCircle className="size-6" />
          </div>
          <CardTitle className="text-base font-bold text-foreground">
            تجهيز اختبار تدريبي للمحاضرة
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            حدد عدد الأسئلة ومستوى الصعوبة لبدء اختبار تفاعلي فوري مبني بالكامل على هذا الملف.
          </p>
        </CardHeader>

        <CardContent className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Question Count */}
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                عدد الأسئلة
              </label>
              <Select
                value={String(questionCount)}
                onValueChange={(val) => setQuestionCount(Number(val))}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 أسئلة</SelectItem>
                  <SelectItem value="10">10 أسئلة (موصى به)</SelectItem>
                  <SelectItem value="15">15 سؤالًا</SelectItem>
                  <SelectItem value="20">20 سؤالًا</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Difficulty */}
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                مستوى الصعوبة
              </label>
              <Select
                value={difficulty}
                onValueChange={(val) => setDifficulty(val as QuizDifficulty)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">سهل (مفاهيم أساسية)</SelectItem>
                  <SelectItem value="medium">متوسط (تطبيق سريري)</SelectItem>
                  <SelectItem value="hard">متقدم (حالات وأولويات)</SelectItem>
                  <SelectItem value="mixed">مختلط (شامل)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Question Type */}
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                نوع الأسئلة
              </label>
              <Select
                value={questionType}
                onValueChange={(val) => setQuestionType(val as "mcq" | "true_false" | "mixed")}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mixed">مختلط (MCQ + صح/خطأ)</SelectItem>
                  <SelectItem value="mcq">اختيار من متعدد (MCQ)</SelectItem>
                  <SelectItem value="true_false">صح أو خطأ فقط</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex items-center justify-between border-t border-border pt-4">
          {quiz ? (
            <Button variant="ghost" size="sm" onClick={() => setShowConfig(false)}>
              إلغاء والعودة للاختبار الحالي
            </Button>
          ) : <span />}
          <Button onClick={() => handleGenerateQuiz(Boolean(quiz))} className="gap-2 text-xs">
            <Play className="size-3.5" />
            بدء الاختبار الآن
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // 3. Review Mistakes Mode
  if (mistakesMode && mistakes.length > 0) {
    const activeMistake = mistakes[mistakeIndex];
    const q = activeMistake.question;

    return (
      <Card className="border-amber-500/30 shadow-sm max-w-2xl mx-auto">
        <CardHeader className="p-4 border-b border-border/60 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 text-xs">
              مراجعة الأخطاء ({mistakeIndex + 1} من {mistakes.length})
            </Badge>
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              الموضوع: {activeMistake.topic}
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setMistakesMode(false)}
            className="text-xs h-7"
          >
            إغلاق المراجعة
          </Button>
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <span className="text-xs font-semibold text-muted-foreground">السؤال:</span>
            <p dir="auto" className="text-sm sm:text-base font-bold text-foreground leading-relaxed [unicode-bidi:plaintext]">
              {q?.question}
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
              <span className="font-bold text-destructive flex items-center gap-1.5">
                <XCircle className="size-4" />
                إجابتك السابقة كانت:
              </span>
              <p dir="auto" className="text-foreground font-semibold [unicode-bidi:plaintext]">
                {activeMistake.student_answer}
              </p>
            </div>

            <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 space-y-1">
              <span className="font-bold text-green-700 dark:text-green-300 flex items-center gap-1.5">
                <CheckCircle2 className="size-4" />
                الإجابة الصحيحة:
              </span>
              <p dir="auto" className="text-foreground font-semibold [unicode-bidi:plaintext]">
                {activeMistake.correct_answer}
              </p>
            </div>

            {q?.rationale && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5">
                <span className="font-bold text-primary flex items-center gap-1.5">
                  <BookOpen className="size-3.5" />
                  الشرح والتعليل السريري:
                </span>
                <p dir="auto" className="text-muted-foreground leading-relaxed [unicode-bidi:plaintext]">
                  {q.rationale}
                </p>
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="p-4 border-t border-border flex items-center justify-between">
          <Button
            size="sm"
            variant="outline"
            disabled={mistakeIndex <= 0}
            onClick={() => setMistakeIndex((i) => Math.max(0, i - 1))}
            className="text-xs"
          >
            السابق
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={mistakeIndex >= mistakes.length - 1}
            onClick={() => setMistakeIndex((i) => Math.min(mistakes.length - 1, i + 1))}
            className="text-xs"
          >
            التالي
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // 4. Completed State (Score, Missed Topics & Mistakes Button)
  if (isCompleted) {
    const total = completionSummary?.totalQuestions ?? quiz.questions.length;
    const correct = completionSummary?.correctCount ?? 0;
    const score = completionSummary?.score ?? (total > 0 ? Math.round((correct / total) * 100) : 0);
    const missed = completionSummary?.missedTopics ?? [];

    const isPassed = score >= 60;

    return (
      <Card className="border-border shadow-xs max-w-xl mx-auto text-center">
        <CardHeader className="p-6 pb-2">
          <div
            className={`size-14 rounded-full mx-auto flex items-center justify-center mb-2 ${
              isPassed ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
            }`}
          >
            <Award className="size-8" />
          </div>
          <CardTitle className="text-xl font-bold text-foreground">
            {isPassed ? "أحسنت! أداء ممتاز" : "اكتمل الاختبار! فرصة جيدة للمراجعة"}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            تم حفظ نتيجتك وأخطائك لتعزيز الموضوعات التي تحتاج تركيزًا.
          </p>
        </CardHeader>

        <CardContent className="p-6 space-y-5">
          {/* Big Score Display */}
          <div className="rounded-2xl bg-muted/40 p-6 space-y-2">
            <span className="text-3xl sm:text-4xl font-black text-primary">
              {score}%
            </span>
            <p className="text-xs text-muted-foreground">
              أجبت على <strong className="text-foreground">{correct}</strong> من أصل{" "}
              <strong className="text-foreground">{total}</strong> سؤالًا بشكل صحيح.
            </p>
          </div>

          {/* Missed Topics list if any */}
          {missed.length > 0 && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-start space-y-2">
              <span className="text-xs font-bold text-destructive flex items-center gap-1.5">
                <AlertTriangle className="size-3.5" />
                مواضيع تحتاج مراجعة (Topics Missed):
              </span>
              <ul className="list-inside list-disc text-xs text-muted-foreground space-y-1">
                {missed.map((topic, idx) => (
                  <li key={idx} className="font-medium text-foreground">
                    {topic}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            {missed.length > 0 || (total - correct > 0) ? (
              <Button
                variant="outline"
                size="default"
                disabled={loadingMistakes}
                onClick={handleReviewMistakes}
                className="flex-1 gap-2 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950"
              >
                {loadingMistakes ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                مراجعة الأخطاء فقط (Review Mistakes)
              </Button>
            ) : null}

            <Button
              variant="default"
              size="default"
              onClick={() => startRunner(quiz.id)}
              className="flex-1 gap-2"
            >
              <RotateCcw className="size-4" />
              إعادة الاختبار
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowConfig(true)}
            className="text-xs text-muted-foreground"
          >
            توليد اختبار جديد بإعدادات أخرى
          </Button>
        </CardContent>
      </Card>
    );
  }

  // 5. Active Single-Question Runner State
  const currentQ = quiz.questions[currentQuestionIndex];
  const isCorrect = selectedAnswer?.trim().toLowerCase() === currentQ.correct_answer.trim().toLowerCase();

  return (
    <Card className="border-border shadow-xs max-w-2xl mx-auto">
      {/* Question Header */}
      <CardHeader className="p-4 pb-2 border-b border-border/60">
        <div className="flex items-center justify-between gap-2 text-xs mb-2">
          <Badge variant="outline" className="font-semibold text-primary border-primary/30">
            السؤال {currentQuestionIndex + 1} من {quiz.questions.length}
          </Badge>
          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
            الموضوع: {currentQ.topic || "عام"}
          </span>
        </div>
        <Progress
          value={((currentQuestionIndex + 1) / quiz.questions.length) * 100}
          className="h-1.5"
        />
      </CardHeader>

      {/* Question Content */}
      <CardContent className="p-6 space-y-5">
        <div className="space-y-1">
          <p dir="auto" className="text-sm sm:text-base font-bold text-foreground leading-relaxed [unicode-bidi:plaintext]">
            {currentQ.question}
          </p>
        </div>

        {/* Options */}
        <div className="space-y-2">
          {currentQ.options.map((option, idx) => {
            const isThisSelected = selectedAnswer === option;
            const isThisCorrect = option.trim().toLowerCase() === currentQ.correct_answer.trim().toLowerCase();

            let optionStyle = "border-border hover:bg-muted/60 text-foreground";
            if (revealed) {
              if (isThisCorrect) {
                optionStyle = "border-green-500 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-200 font-bold ring-1 ring-green-500";
              } else if (isThisSelected) {
                optionStyle = "border-destructive bg-destructive/10 text-destructive font-bold";
              } else {
                optionStyle = "border-border/60 opacity-60";
              }
            }

            return (
              <button
                key={idx}
                disabled={revealed}
                onClick={() => handleSelectOption(option)}
                dir="auto"
                className={`w-full text-start p-3.5 rounded-xl border text-xs sm:text-sm transition-all flex items-center justify-between gap-3 ${optionStyle}`}
              >
                <span className="[unicode-bidi:plaintext] flex-1">{option}</span>
                {revealed && isThisCorrect && (
                  <CheckCircle2 className="size-4 text-green-600 dark:text-green-400 shrink-0" />
                )}
                {revealed && isThisSelected && !isThisCorrect && (
                  <XCircle className="size-4 text-destructive shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Educational Rationale Feedback (Shown immediately after answer) */}
        {revealed && (
          <div
            className={`rounded-xl p-4 space-y-2 text-xs leading-relaxed animate-in fade-in duration-200 border ${
              isCorrect
                ? "border-green-500/20 bg-green-500/5 text-green-950 dark:text-green-200"
                : "border-destructive/20 bg-destructive/5 text-destructive-foreground dark:text-destructive-foreground"
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold">
              {isCorrect ? (
                <>
                  <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
                  <span className="text-green-700 dark:text-green-300">إجابة صحيحة!</span>
                </>
              ) : (
                <>
                  <XCircle className="size-4 text-destructive" />
                  <span className="text-destructive font-bold">إجابة غير صحيحة</span>
                </>
              )}
            </div>

            <div className="space-y-1 text-foreground/90">
              <span className="font-semibold text-primary block">التفسير السريري (Rationale):</span>
              <p dir="auto" className="[unicode-bidi:plaintext] leading-relaxed">
                {currentQ.rationale}
              </p>
            </div>
          </div>
        )}
      </CardContent>

      {/* Footer Navigation */}
      <CardFooter className="p-4 border-t border-border flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowConfig(true)}
          className="text-xs text-muted-foreground"
        >
          إعدادات الاختبار
        </Button>

        {revealed && (
          <Button
            size="sm"
            onClick={handleNextQuestion}
            className="gap-1.5 text-xs animate-in fade-in"
          >
            {currentQuestionIndex < quiz.questions.length - 1 ? (
              <>
                السؤال التالي
                <ChevronRight className="size-3.5" />
              </>
            ) : (
              <>
                إنهاء الاختبار وعرض النتيجة
                <Award className="size-3.5" />
              </>
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
