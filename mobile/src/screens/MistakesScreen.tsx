import React, { useEffect, useState, useCallback } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { useNavigation } from "../context/NavigationContext";
import { apiFetch } from "../services/api";

interface Mistake {
  id: string;
  subjectId: string;
  topicKey: string;
  question: string;
  studentAnswer: string;
  correctAnswer: string;
  rationale: string | null;
  options: string[];
  subjectName: string;
  topic: string;
  status: "new" | "reviewing" | "mastered";
  wrongCount: number;
}

export function MistakesScreen() {
  const { navigate } = useNavigation();

  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [selectedSubject, setSelectedSubject] = useState("");
  const [topics, setTopics] = useState<{ key: string; name: string }[]>([]);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reviewAnswers, setReviewAnswers] = useState<Record<string, string>>(
    {},
  );
  const [reviewBusy, setReviewBusy] = useState<string | null>(null);
  const [reviewResult, setReviewResult] = useState<Record<string, string>>({});
  const [currentCount, setCurrentCount] = useState(0);

  const fetchMistakes = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (selectedSubject) params.append("subject", selectedSubject);
      if (selectedTopic) params.append("topic", selectedTopic);
      if (selectedStatus) params.append("status", selectedStatus);

      const res = await apiFetch(
        `/api/learning-progress/mistakes?${params.toString()}`,
      );
      setMistakes(res.mistakes || []);
      setSubjects(res.subjects || []);
      setTopics(res.topics || []);
      setCurrentCount(res.currentCount || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل الأخطاء");
    } finally {
      setLoading(false);
    }
  }, [selectedSubject, selectedStatus, selectedTopic]);

  useEffect(() => {
    fetchMistakes();
  }, [fetchMistakes]);

  const handleMarkReview = async (id: string) => {
    if (!reviewAnswers[id]?.trim() || reviewBusy) return;
    setReviewBusy(id);
    try {
      const result = await apiFetch(
        `/api/learning-progress/mistakes/${id}/review`,
        {
          method: "POST",
          body: JSON.stringify({ studentAnswer: reviewAnswers[id] }),
        },
      );
      setReviewResult((prev) => ({
        ...prev,
        [id]: result.isCorrect
          ? "صحيح؛ تحتاج مراجعة صحيحة لاحقة للوصول إلى الإتقان"
          : "الإجابة غير صحيحة؛ راجع الشرح وحاول مجددًا",
      }));
      fetchMistakes();
    } catch (e: any) {
      setReviewResult((prev) => ({
        ...prev,
        [id]: e.message || "فشل تسجيل المراجعة",
      }));
    } finally {
      setReviewBusy(null);
    }
  };

  const handleTargetedPractice = async (
    subjectId?: string,
    topicKey?: string,
  ) => {
    try {
      const res = await apiFetch("/api/learning-progress/targeted-review", {
        method: "POST",
        body: JSON.stringify({ subjectId, topicKey, questionCount: 5 }),
      });

      if (!res.questions || res.questions.length === 0) {
        alert("لا توجد أسئلة موجهة كافية حاليًا.");
        return;
      }

      navigate("quiz-runner", {
        attemptId: res.attemptId,
        questions: res.questions,
        mode: "STUDY",
        title: "تدريب مستهدف على الأخطاء",
      });
    } catch (err: any) {
      alert(err.message || "تعذر بدء المراجعة الموجهة");
    }
  };

  return (
    <div className="space-y-4 pb-nav">
      {/* Counters Banner */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-3xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-1">
          <span className="text-[11px] font-bold">أخطاء قيد المراجعة</span>
          <p className="text-2xl font-black">{currentCount}</p>
        </div>

        <div className="p-4 rounded-3xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-teal-900 dark:text-teal-200 space-y-1">
          <span className="text-[11px] font-bold">المواد التي بها أخطاء</span>
          <p className="text-2xl font-black">{subjects.length}</p>
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex gap-2">
        <select
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(e.target.value)}
          className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-bold"
        >
          <option value="">كافة المواد</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-bold"
        >
          <option value="">كافة الحالات</option>
          <option value="new">جديد</option>
          <option value="reviewing">قيد المراجعة</option>
          <option value="mastered">تم إتقانه</option>
        </select>
      </div>

      {error && (
        <div role="alert" className="surface text-red-600">
          <p>{error}</p>
          <button className="btn-secondary mt-2" onClick={fetchMistakes}>
            إعادة المحاولة
          </button>
        </div>
      )}
      {topics.length > 0 && (
        <select
          aria-label="موضوع الخطأ"
          className="field w-full"
          value={selectedTopic}
          onChange={(e) => setSelectedTopic(e.target.value)}
        >
          <option value="">كل المواضيع</option>
          {topics.map((topic) => (
            <option key={topic.key} value={topic.key}>
              {topic.name}
            </option>
          ))}
        </select>
      )}
      {/* Mistakes List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-2">
          <RefreshCw className="size-6 text-primary animate-spin" />
          <span className="text-xs text-slate-400">جارٍ جلب الأخطاء...</span>
        </div>
      ) : error ? null : mistakes.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-10 text-center space-y-2">
          <CheckCircle2 className="size-8 text-emerald-500 mx-auto" />
          <h4 className="text-xs font-black text-slate-900 dark:text-white">
            ممتاز، لا توجد أخطاء مسجلة حاليًا!
          </h4>
          <p className="text-[11px] text-slate-400">
            ستظهر هنا أي أسئلة تجيب عنها خطأ أثناء الاختبارات لمراجعتها.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {mistakes.map((m) => (
            <div
              key={m.id}
              className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500">
                  {m.subjectName} · {m.topic}
                </span>
                <span className="rounded-md bg-red-50 text-red-600 px-2 py-0.5 text-[10px] font-bold">
                  تكرر الخطأ {m.wrongCount}x
                </span>
              </div>

              <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-relaxed">
                {m.question}
              </h4>

              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">إجابتك السابقة:</span>
                  <span className="font-bold text-red-600">
                    {m.studentAnswer}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">الإجابة الصحيحة:</span>
                  <span className="font-bold text-emerald-600">
                    {m.correctAnswer}
                  </span>
                </div>
                {m.rationale && (
                  <p className="pt-2 border-t border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 leading-relaxed">
                    💡 {m.rationale}
                  </p>
                )}
              </div>

              <button
                className="btn-secondary w-full"
                onClick={() => handleTargetedPractice(m.subjectId, m.topicKey)}
              >
                تدريب مستهدف على هذا الموضوع
              </button>
              <div className="space-y-2 pt-1">
                <label className="block text-sm">
                  أجب مجددًا لمراجعة هذا الخطأ
                  {m.options?.length ? (
                    <select
                      className="field w-full mt-2"
                      value={reviewAnswers[m.id] || ""}
                      onChange={(e) =>
                        setReviewAnswers((prev) => ({
                          ...prev,
                          [m.id]: e.target.value,
                        }))
                      }
                    >
                      <option value="">اختر إجابتك</option>
                      {m.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="field w-full mt-2"
                      value={reviewAnswers[m.id] || ""}
                      onChange={(e) =>
                        setReviewAnswers((prev) => ({
                          ...prev,
                          [m.id]: e.target.value,
                        }))
                      }
                    />
                  )}
                </label>
                <button
                  disabled={Boolean(reviewBusy) || !reviewAnswers[m.id]?.trim()}
                  onClick={() => handleMarkReview(m.id)}
                  className="btn-primary w-full"
                >
                  {reviewBusy === m.id
                    ? "جارٍ الحفظ..."
                    : "تأكيد إجابة المراجعة"}
                </button>
                {reviewResult[m.id] && (
                  <p role="status" className="text-sm text-primary">
                    {reviewResult[m.id]}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
