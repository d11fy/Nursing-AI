import React, { useEffect, useRef, useState } from "react";
import {
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { useNavigation } from "../context/NavigationContext";
import { apiFetch } from "../services/api";
import {
  questionText,
  questionOptions,
  isCorrectAnswer,
  answerFeedback,
  completionReview,
  type AnswerFeedback,
} from "../services/quiz";
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
    replace,
    goBack,
    exitQuiz,
    setIsQuizActive,
    showQuizExitConfirm,
    setShowQuizExitConfirm,
  } = useNavigation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, unknown>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  // The server sends the answer key only after an answer is recorded (study
  // mode) or after the attempt is completed; questions never carry it.
  const [feedback, setFeedback] = useState<Record<number, AnswerFeedback>>({});
  const [seconds, setSeconds] = useState(0);
  const [pending, setPending] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const serverAttemptRef = useRef(attemptId);
  useEffect(() => {
    setIsQuizActive(true);
    return () => setIsQuizActive(false);
  }, [setIsQuizActive]);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const timer = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  const isStudyPack = Boolean(studyPackId && quizId);
  const ensureAttempt = async () => {
    if (serverAttemptRef.current) return serverAttemptRef.current;
    if (!isStudyPack)
      throw new Error("معرف محاولة الاختبار غير متوفر؛ أعد بدء التدريب");
    const result = await apiFetch(
      `/api/study-packs/${studyPackId}/quiz/attempt?action=start`,
      { method: "POST", body: JSON.stringify({ quizId }) },
    );
    serverAttemptRef.current = result.id;
    return result.id as string;
  };
  const saveAnswer = async (index: number, answer: unknown) => {
    const id = await ensureAttempt();
    const endpoint = isStudyPack
      ? `/api/study-packs/${studyPackId}/quiz/attempt?action=answer`
      : "/api/practice/submit-answer";
    return apiFetch(endpoint, {
      method: "POST",
      body: JSON.stringify(
        isStudyPack
          ? {
              attemptId: id,
              questionId: questions[index].id,
              studentAnswer: answer,
            }
          : {
              attemptId: id,
              questionId: questions[index].id,
              selectedAnswer: answer,
            },
      ),
    });
  };
  const confirmAnswer = async () => {
    if (busyRef.current || answers[currentIndex] == null || saved[currentIndex])
      return;
    busyRef.current = true;
    setPending(true);
    setError("");
    try {
      const response = await saveAnswer(currentIndex, answers[currentIndex]);
      const result = answerFeedback(response);
      if (mode === "STUDY" && !result)
        throw new Error("تعذر عرض الشرح؛ حاول مجددًا");
      if (result) setFeedback((prev) => ({ ...prev, [currentIndex]: result }));
      setSaved((prev) => ({ ...prev, [currentIndex]: true }));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "تعذر حفظ الإجابة؛ حاول مجددًا",
      );
    } finally {
      busyRef.current = false;
      setPending(false);
    }
  };
  const finish = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPending(true);
    setError("");
    try {
      const id = await ensureAttempt();
      for (let index = 0; index < questions.length; index++)
        if (!saved[index] && answers[index] != null) {
          await saveAnswer(index, answers[index]);
          setSaved((prev) => ({ ...prev, [index]: true }));
        }
      const summary = await apiFetch(
        isStudyPack
          ? `/api/study-packs/${studyPackId}/quiz/attempt?action=complete`
          : "/api/practice/submit-answer",
        {
          method: "POST",
          body: JSON.stringify({
            attemptId: id,
            ...(isStudyPack ? {} : { action: "COMPLETE" }),
          }),
        },
      );
      const review = completionReview(summary);
      const results = questions.map((q, index) => {
        const item = review.get(q.id) ?? feedback[index];
        const correct = item?.correctAnswer;
        return {
        questionText: questionText(q),
        userChoice:
          answers[index] == null
            ? "لم تتم الإجابة"
            : Array.isArray(answers[index])
              ? (answers[index] as string[]).join("، ")
              : String(answers[index]),
        correctChoice: Array.isArray(correct)
          ? (correct as string[]).join("، ")
          : String(correct ?? ""),
        isCorrect:
          item?.isCorrect ??
          (item ? isCorrectAnswer({ correctAnswer: correct }, answers[index], isStudyPack) : false),
        explanation: item?.explanation ?? undefined,
        sourceCitation: q.source_reference || q.sourceLabel || q.sourceCitation,
        };
      });
      setIsQuizActive(false);
      replace("quiz-results", {
        scorePercent: summary.score ?? summary.scorePercentage,
        correctCount: summary.correctCount ?? summary.correctAnswers,
        totalQuestions: questions.length,
        timeSpent: timer,
        results,
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "تعذر إنهاء الاختبار. إجاباتك محفوظة؛ حاول مجددًا",
      );
    } finally {
      busyRef.current = false;
      setPending(false);
    }
  };
  const q = questions[currentIndex];
  if (!q)
    return (
      <div role="alert" className="surface">
        <p>لا توجد أسئلة متاحة.</p>
        <button onClick={goBack} className="btn-secondary mt-3">
          الرجوع
        </button>
      </div>
    );
  const answer = answers[currentIndex];
  const currentFeedback = feedback[currentIndex];
  const revealed = mode === "STUDY" && Boolean(currentFeedback);
  const multi = q.questionType === "SATA" || q.question_type === "SATA";
  const options = questionOptions(q);
  const select = (value: string) => {
    if (pending || revealed) return;
    setAnswers((prev) => ({
      ...prev,
      [currentIndex]: multi
        ? Array.isArray(prev[currentIndex])
          ? (prev[currentIndex] as string[]).includes(value)
            ? (prev[currentIndex] as string[]).filter((x) => x !== value)
            : [...(prev[currentIndex] as string[]), value]
          : [value]
        : value,
    }));
  };
  return (
    <div className="space-y-4 pb-nav">
      <div className="surface flex items-center justify-between">
        <div>
          <h2 className="font-bold text-sm">{title}</h2>
          <p className="text-xs text-slate-500 mt-1">
            السؤال {currentIndex + 1} من {questions.length}
          </p>
        </div>
        <span className="flex items-center gap-2 font-mono text-sm">
          <Clock className="size-4 text-primary" />
          {timer}
        </span>
      </div>
      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
        />
      </div>
      {error && (
        <div role="alert" className="surface text-red-600 text-sm">
          {error}
        </div>
      )}
      <article className="surface space-y-4">
        <p className="text-xs text-slate-500">{q.topic}</p>
        <h3 className="text-base font-bold leading-8 selectable-text">
          {questionText(q)}
        </h3>
        {multi && (
          <p className="text-sm text-primary">
            اختر جميع الإجابات الصحيحة، ثم أكد الإجابة.
          </p>
        )}
        <div className="space-y-2">
          {options.map((option) => {
            const selected = multi
              ? Array.isArray(answer) && answer.includes(option.value)
              : answer === option.value;
            const correct =
              revealed &&
              (multi
                ? Array.isArray(currentFeedback.correctAnswer) &&
                  (currentFeedback.correctAnswer as string[]).includes(option.value)
                : isCorrectAnswer(
                    { correctAnswer: currentFeedback.correctAnswer },
                    option.value,
                    isStudyPack,
                  ));
            return (
              <button
                key={option.id}
                disabled={pending || revealed}
                aria-pressed={selected}
                onClick={() => select(option.value)}
                className={`w-full min-h-14 rounded-2xl border p-3 text-start text-sm leading-6 flex items-center justify-between gap-2 ${revealed && correct ? "border-emerald-500 bg-emerald-50 text-emerald-800" : revealed && selected ? "border-red-500 bg-red-50 text-red-800" : selected ? "border-primary bg-teal-50 text-primary" : "border-slate-200 dark:border-slate-700"}`}
              >
                <span dir="auto" className="bidi-text">{option.text}</span>
                {revealed && correct ? (
                  <CheckCircle2 className="size-5 shrink-0" />
                ) : revealed && selected ? (
                  <XCircle className="size-5 shrink-0" />
                ) : null}
              </button>
            );
          })}
        </div>
        {!options.length && (
          <textarea
            aria-label="إجابتك"
            className="field w-full p-3"
            disabled={pending || revealed}
            value={typeof answer === "string" ? answer : ""}
            onChange={(e) =>
              setAnswers((prev) => ({
                ...prev,
                [currentIndex]: e.target.value,
              }))
            }
            placeholder="اكتب إجابتك..."
          />
        )}
        {mode === "STUDY" && !revealed && (
          <button
            className="btn-primary w-full"
            disabled={
              pending ||
              answer == null ||
              answer === "" ||
              (Array.isArray(answer) && !answer.length)
            }
            onClick={confirmAnswer}
          >
            {pending ? "جارٍ حفظ الإجابة..." : "تأكيد الإجابة وعرض الشرح"}
          </button>
        )}
        {revealed && (
          <div className="rounded-2xl bg-teal-50 dark:bg-slate-800 p-4 space-y-2">
            <b className="text-primary">
              {(currentFeedback.isCorrect ??
              isCorrectAnswer(
                { correctAnswer: currentFeedback.correctAnswer },
                answer,
                isStudyPack,
              ))
                ? "إجابة صحيحة"
                : "راجع الإجابة"}
            </b>
            <p className="text-sm leading-7 selectable-text">
              {currentFeedback.explanation}
            </p>
            <p className="text-xs text-slate-500">
              {q.source_reference || q.sourceLabel || q.sourceCitation}
            </p>
          </div>
        )}
      </article>
      <div className="flex justify-between gap-2">
        <button
          className="btn-secondary"
          disabled={currentIndex === 0 || pending}
          onClick={() => setCurrentIndex((v) => v - 1)}
        >
          <ArrowRight className="size-4" />
          السابق
        </button>
        {currentIndex === questions.length - 1 ? (
          <button className="btn-primary" disabled={pending} onClick={finish}>
            {pending ? "جارٍ الحفظ والتقييم..." : "إنهاء الاختبار"}
          </button>
        ) : (
          <button
            className="btn-primary"
            disabled={pending}
            onClick={() => setCurrentIndex((v) => v + 1)}
          >
            التالي
            <ArrowLeft className="size-4" />
          </button>
        )}
      </div>
      <QuizExitConfirmModal
        isOpen={showQuizExitConfirm}
        onConfirm={exitQuiz}
        onCancel={() => setShowQuizExitConfirm(false)}
      />
    </div>
  );
}
