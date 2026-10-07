import React, { useEffect, useState } from "react";
import {
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  BookOpen,
} from "lucide-react";
import { useNavigation } from "../context/NavigationContext";
import { apiFetch } from "../services/api";
import { QuizExitConfirmModal } from "../components/common/QuizExitConfirmModal";

export function QuizRunner({
  attemptId,
  quizId,
  studyPackId,
  questions = [],
  mode = "STUDY",
  title = "اختبار تدريبي",
}: {
  attemptId?: string;
  quizId?: string;
  studyPackId?: string;
  questions: any[];
  mode?: "STUDY" | "EXAM";
  title?: string;
}) {
  const {
    navigate,
    goBack,
    setIsQuizActive,
    showQuizExitConfirm,
    setShowQuizExitConfirm,
  } = useNavigation();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [revealedExplanations, setRevealedExplanations] = useState<Record<number, boolean>>({});
  const [seconds, setSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Mark quiz active for Hardware Back Button protection
  useEffect(() => {
    setIsQuizActive(true);
    return () => {
      setIsQuizActive(false);
    };
  }, [setIsQuizActive]);

  // Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const currentQ = questions[currentIndex];
  if (!currentQ) return null;

  // Options normalization
  const options = Array.isArray(currentQ.options)
    ? currentQ.options.map((opt: any, idx: number) => {
        if (typeof opt === "string") {
          const letter = ["A", "B", "C", "D"][idx] || String(idx);
          return { id: letter, text: opt };
        }
        return {
          id: opt.id || opt.key || ["A", "B", "C", "D"][idx],
          text: opt.text || opt.option || String(opt),
        };
      })
    : [];

  const handleSelectOption = (optionId: string) => {
    if (selectedAnswers[currentIndex] && mode === "STUDY") return;

    setSelectedAnswers((prev) => ({ ...prev, [currentIndex]: optionId }));

    if (mode === "STUDY") {
      setRevealedExplanations((prev) => ({ ...prev, [currentIndex]: true }));

      // If attemptId exists, record answer on server
      if (attemptId && currentQ.id) {
        apiFetch("/api/practice/submit-answer", {
          method: "POST",
          body: JSON.stringify({
            attemptId,
            questionId: currentQ.id,
            selectedOptionId: optionId,
          }),
        }).catch(() => {});
      }
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleFinishQuiz = async () => {
    setSubmitting(true);
    try {
      // Calculate scores
      let correctCount = 0;
      const questionResults = questions.map((q, idx) => {
        const userChoice = selectedAnswers[idx];
        const correctChoice = q.correctOptionId || q.correct_option_id || q.correctAnswer || "A";
        const isCorrect = userChoice === correctChoice;
        if (isCorrect) correctCount++;
        return {
          questionText: q.stem || q.question,
          userChoice,
          correctChoice,
          isCorrect,
          explanation: q.rationale || q.explanation,
          sourceCitation: q.sourceCitation || q.source,
        };
      });

      const scorePercent = Math.round((correctCount / questions.length) * 100);

      // Record study pack attempt if applicable
      if (studyPackId && quizId) {
        try {
          await apiFetch(`/api/study-packs/${studyPackId}/quiz/attempt`, {
            method: "POST",
            body: JSON.stringify({
              quizId,
              score: scorePercent,
              answers: selectedAnswers,
            }),
          });
        } catch {}
      }

      setIsQuizActive(false);
      navigate("quiz-results", {
        scorePercent,
        correctCount,
        totalQuestions: questions.length,
        timeSpent: formatTimer(seconds),
        results: questionResults,
      });
    } catch (e: any) {
      alert("حدث خطأ أثناء إنهاء الاختبار");
    } finally {
      setSubmitting(false);
    }
  };

  const currentSelection = selectedAnswers[currentIndex];
  const correctAnswerId = currentQ.correctOptionId || currentQ.correct_option_id || currentQ.correctAnswer;
  const isExplanationShown = mode === "STUDY" && Boolean(revealedExplanations[currentIndex]);

  return (
    <div className="space-y-4 pb-nav">
      {/* Top Bar with Timer and Progress */}
      <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-teal-50 dark:bg-slate-800 text-primary font-black text-xs">
            {currentIndex + 1}
          </span>
          <span className="text-xs font-bold text-slate-500">
            من {questions.length} سؤال
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
          <Clock className="size-3.5 text-primary" />
          <span>{formatTimer(seconds)}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
        />
      </div>

      {/* Question Card */}
      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        {currentQ.topic && (
          <span className="inline-block rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
            {currentQ.topic}
          </span>
        )}

        <h3 className="text-sm font-black text-slate-900 dark:text-white leading-relaxed selectable-text">
          {currentQ.stem || currentQ.question}
        </h3>

        {/* Options */}
        <div className="space-y-2.5 pt-1">
          {options.map((opt: any) => {
            const isSelected = currentSelection === opt.id;
            const isCorrect = opt.id === correctAnswerId;

            let optionStyle =
              "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:border-slate-300";

            if (isExplanationShown) {
              if (isCorrect) {
                optionStyle = "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 font-bold";
              } else if (isSelected && !isCorrect) {
                optionStyle = "border-red-500 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 font-bold";
              }
            } else if (isSelected) {
              optionStyle = "border-primary bg-teal-50 dark:bg-teal-950/40 text-primary font-bold shadow-xs";
            }

            return (
              <button
                key={opt.id}
                onClick={() => handleSelectOption(opt.id)}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border text-xs leading-relaxed text-start active:scale-98 transition-all ${optionStyle}`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-mono font-bold">
                    {opt.id}
                  </span>
                  <span>{opt.text}</span>
                </div>

                {isExplanationShown && isCorrect && (
                  <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                )}
                {isExplanationShown && isSelected && !isCorrect && (
                  <XCircle className="size-4 text-red-600 shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Study Mode Instant Explanation */}
        {isExplanationShown && (currentQ.rationale || currentQ.explanation) && (
          <div className="rounded-2xl bg-teal-50 dark:bg-slate-800/80 p-4 border border-teal-200 dark:border-slate-700 space-y-2 animate-in fade-in">
            <div className="flex items-center gap-1.5 text-xs font-black text-primary dark:text-teal-300">
              <Sparkles className="size-3.5" />
              <span>التفسير السريري المعتمد</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 selectable-text">
              {currentQ.rationale || currentQ.explanation}
            </p>
            {currentQ.sourceCitation && (
              <p className="text-[10px] text-slate-400 pt-1">
                📚 <strong>المصدر:</strong> {currentQ.sourceCitation}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Navigation & Submit Buttons */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="flex items-center gap-1 px-4 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold disabled:opacity-30 active:scale-95"
        >
          <ChevronRight className="size-4" />
          <span>السابق</span>
        </button>

        {currentIndex === questions.length - 1 ? (
          <button
            onClick={handleFinishQuiz}
            disabled={submitting}
            className="flex items-center gap-1.5 px-6 h-11 rounded-2xl bg-primary text-white text-xs font-black shadow-md active:scale-97 transition-all disabled:opacity-60"
          >
            <span>{submitting ? "جارٍ الحساب..." : "تسليم النتيجة"}</span>
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="flex items-center gap-1 px-5 h-11 rounded-xl bg-primary text-white text-xs font-bold active:scale-95 shadow-xs"
          >
            <span>التالي</span>
            <ChevronLeft className="size-4" />
          </button>
        )}
      </div>

      {/* Hardware Back Button Protection Modal */}
      <QuizExitConfirmModal
        isOpen={showQuizExitConfirm}
        onConfirm={() => {
          setIsQuizActive(false);
          setShowQuizExitConfirm(false);
          goBack();
        }}
        onCancel={() => setShowQuizExitConfirm(false)}
      />
    </div>
  );
}
