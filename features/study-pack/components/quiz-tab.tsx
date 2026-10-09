"use client";

import { useState, useEffect } from "react";
import {
  HelpCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Award,
  AlertTriangle,
  Play,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { QuizAnswerFeedback, QuizDifficulty, StudentMistakeItem, StudentQuizItem } from "../types";

const difficultyLabels: Record<QuizDifficulty, string> = {
  easy: "سهل",
  medium: "متوسط",
  hard: "متقدم",
  mixed: "مختلط",
};

const questionTypeLabels = {
  mixed: "مختلط",
  mcq: "اختيار من متعدد",
  true_false: "صح أو خطأ",
} as const;

export function QuizTab({
  studyPackId,
  initialQuiz,
}: {
  studyPackId: string;
  initialQuiz?: StudentQuizItem | null;
}) {
  const [quiz, setQuiz] = useState<StudentQuizItem | null>(initialQuiz ?? null);
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
  // The answer key arrives from the server only after the answer is recorded.
  const [feedback, setFeedback] = useState<QuizAnswerFeedback | null>(null);
  const revealed = feedback !== null;
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
      } else {
        toast.error(data.error || "تعذر بدء محاولة الاختبار؛ أعد المحاولة");
      }
    } catch {
      toast.error("تعذر بدء محاولة الاختبار؛ تحقق من الاتصال");
    }

    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setFeedback(null);
    setIsCompleted(false);
    setCompletionSummary(null);
    setMistakesMode(false);
  }

  // Submit Answer
  async function handleSelectOption(option: string) {
    if (revealed || submittingAnswer) return;

    const activeQuestion = quiz?.questions[currentQuestionIndex];
    if (!activeQuestion || !attemptId) {
      toast.error("لم تبدأ محاولة الاختبار بعد؛ أعد فتح الاختبار");
      return;
    }
    setSelectedAnswer(option);
    setSubmittingAnswer(true);
    try {
      const res = await fetch(`/api/study-packs/${studyPackId}/quiz/attempt?action=answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId,
          questionId: activeQuestion.id,
          studentAnswer: option,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.correctAnswer !== "string") throw new Error(data.error || "تعذر حفظ إجابتك");
      setFeedback(data as QuizAnswerFeedback);
    } catch (err) {
      setSelectedAnswer(null);
      toast.error(err instanceof Error ? err.message : "تعذر حفظ إجابتك؛ حاول مرة أخرى");
    } finally {
      setSubmittingAnswer(false);
    }
  }

  // Next Question or Finish
  async function handleNextQuestion() {
    if (!quiz) return;

    if (currentQuestionIndex < quiz.questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setSelectedAnswer(null);
      setFeedback(null);
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
      <Card className="border-border p-5 text-center sm:p-12">
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
      <Card className="mx-auto w-full max-w-xl border-border shadow-xs">
        <CardHeader className="items-center px-4 pb-2 text-center sm:px-5">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HelpCircle className="size-6" />
          </div>
          <CardTitle className="text-base font-bold text-foreground">
            تجهيز اختبار تدريبي للمحاضرة
          </CardTitle>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">
            حدد عدد الأسئلة ومستوى الصعوبة لبدء اختبار تفاعلي فوري مبني بالكامل على هذا الملف.
          </p>
        </CardHeader>

        <CardContent className="space-y-4 px-4 pt-2 sm:px-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Question Count */}
            <div className="min-w-0 space-y-1.5">
              <label id="quiz-label-1" className="block text-sm font-semibold text-foreground">
                عدد الأسئلة
              </label>
              <Select
                value={String(questionCount)}
                onValueChange={(val) => setQuestionCount(Number(val))}
              >
                <SelectTrigger aria-labelledby="quiz-label-1" className="w-full text-sm">
                  <SelectValue>{(value: string) => value}</SelectValue>
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
            <div className="min-w-0 space-y-1.5">
              <label id="quiz-label-2" className="block text-sm font-semibold text-foreground">
                مستوى الصعوبة
              </label>
              <Select
                value={difficulty}
                onValueChange={(val) => setDifficulty(val as QuizDifficulty)}
              >
                <SelectTrigger aria-labelledby="quiz-label-2" className="w-full text-sm">
                  <SelectValue>{(value: QuizDifficulty) => difficultyLabels[value]}</SelectValue>
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
            <div className="min-w-0 space-y-1.5">
              <label id="quiz-label-3" className="block text-sm font-semibold text-foreground">
                نوع الأسئلة
              </label>
              <Select
                value={questionType}
                onValueChange={(val) => setQuestionType(val as "mcq" | "true_false" | "mixed")}
              >
                <SelectTrigger aria-labelledby="quiz-label-3" className="w-full text-sm">
                  <SelectValue>{(value: keyof typeof questionTypeLabels) => questionTypeLabels[value]}</SelectValue>
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

        <CardFooter className="flex flex-col-reverse items-stretch gap-2 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          {quiz ? (
            <Button variant="ghost" size="sm" onClick={() => setShowConfig(false)} className="h-auto min-h-11 whitespace-normal text-center leading-5">
              إلغاء والعودة للاختبار الحالي
            </Button>
          ) : null}
          <Button onClick={() => handleGenerateQuiz(Boolean(quiz))} className="w-full gap-2 sm:ms-auto sm:w-auto">
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
        <CardHeader className="flex flex-col items-stretch gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center">
            <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 text-xs">
              مراجعة الأخطاء ({mistakeIndex + 1} من {mistakes.length})
            </Badge>
            <span className="min-w-0 break-words text-xs text-muted-foreground">
              الموضوع: <bdi dir="auto" className="[unicode-bidi:plaintext]">{activeMistake.topic}</bdi>
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setMistakesMode(false)}
            className="w-full text-xs sm:w-auto"
          >
            إغلاق المراجعة
          </Button>
        </CardHeader>

        <CardContent className="space-y-4 p-4 sm:p-6">
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

        <CardFooter className="flex items-center justify-between gap-2 border-t border-border p-4">
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
      <Card className="mx-auto max-w-xl border-border text-center shadow-xs">
        <CardHeader className="p-4 pb-2 sm:p-6">
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

        <CardContent className="space-y-5 p-4 sm:p-6">
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
  const isCorrect = feedback?.isCorrect ?? false;

  return (
    <Card className="mx-auto w-full max-w-2xl border-border shadow-xs">
      {/* Question Header */}
      <CardHeader className="p-4 pb-2 border-b border-border/60">
        <div className="mb-2 flex min-w-0 flex-col items-start gap-2 text-xs sm:flex-row sm:items-center sm:justify-between">
          <Badge variant="outline" className="font-semibold text-primary border-primary/30">
            السؤال {currentQuestionIndex + 1} من {quiz.questions.length}
          </Badge>
          <span className="min-w-0 break-words text-xs text-muted-foreground">
            الموضوع: <bdi dir="auto" className="[unicode-bidi:plaintext]">{currentQ.topic || "عام"}</bdi>
          </span>
        </div>
        <Progress
          value={((currentQuestionIndex + 1) / quiz.questions.length) * 100}
          className="h-1.5"
        />
      </CardHeader>

      {/* Question Content */}
      <CardContent className="space-y-5 p-4 sm:p-6">
        <div className="space-y-1">
          <p dir="auto" className="text-sm sm:text-base font-bold text-foreground leading-relaxed [unicode-bidi:plaintext]">
            {currentQ.question}
          </p>
        </div>

        {/* Options */}
        <div className="space-y-2">
          {currentQ.options.map((option, idx) => {
            const isThisSelected = selectedAnswer === option;
            const isThisCorrect = feedback !== null && option.trim().toLowerCase() === feedback.correctAnswer.trim().toLowerCase();

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
                disabled={revealed || submittingAnswer}
                aria-pressed={isThisSelected}
                onClick={() => handleSelectOption(option)}
                dir="auto"
                className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border p-3.5 text-start text-sm leading-6 transition-all ${optionStyle}`}
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
                {feedback?.rationale}
              </p>
            </div>
          </div>
        )}
      </CardContent>

      {/* Footer Navigation */}
      <CardFooter className="flex flex-col-reverse items-stretch gap-2 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowConfig(true)}
          className="w-full text-xs text-muted-foreground sm:w-auto"
        >
          إعدادات الاختبار
        </Button>

        {revealed && (
          <Button
            size="sm"
            onClick={handleNextQuestion}
            className="h-auto min-h-11 w-full gap-1.5 whitespace-normal text-center text-xs leading-5 animate-in fade-in sm:w-auto"
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
