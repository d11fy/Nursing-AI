import React, { useEffect, useState } from "react";
import {
  TrendingUp,
  Brain,
  BookOpen,
  ClipboardCheck,
  CircleAlert,
  Target,
  RefreshCw,
  Play,
  ChevronLeft,
} from "lucide-react";
import { useNavigation } from "../context/NavigationContext";
import { apiFetch } from "../services/api";

export function ProgressScreen() {
  const { navigate } = useNavigation();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchProgress = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/learning-progress");
      setData(res);
    } catch (err) {
      console.warn("Failed fetching progress:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProgress();
  }, []);

  const handleLaunchTargeted = async (subjectId?: string, topicKey?: string) => {
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
        title: "تدريب مستهدف لتقوية الموضوع",
      });
    } catch (err: any) {
      alert(err.message || "تعذر بدء المراجعة");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-2">
        <RefreshCw className="size-6 text-primary animate-spin" />
        <span className="text-xs text-slate-400">جارٍ تحليل تقدم التعلم...</span>
      </div>
    );
  }

  if (!data || !data.topics || data.topics.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-10 text-center space-y-3">
        <Brain className="size-10 text-primary mx-auto" />
        <h4 className="text-sm font-black text-slate-900 dark:text-white">
          نحتاج لمزيد من النشاط لحساب التقدم
        </h4>
        <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
          ابدأ بحل بعض الاختبارات (Quizzes) أو مراجعة البطاقات ليتمكن النظام من قياس نسبة إتقانك بدقة.
        </p>
      </div>
    );
  }

  const { summary, subjects = [], weakTopics = [], strongTopics = [], recommendation } = data;

  return (
    <div className="space-y-4 pb-nav">
      {/* Overall Mastery Hero */}
      <div className="rounded-3xl bg-linear-to-l from-slate-900 to-teal-900 p-5 text-white shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-teal-200 flex items-center gap-1.5">
            <Brain className="size-4" />
            التقدم الإجمالي العام
          </span>
          <span className="text-2xl font-black">
            {summary?.overallMastery != null ? `${summary.overallMastery}%` : "—"}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-white/20 text-center">
          <div>
            <span className="block font-black text-sm">{summary?.subjectsStudied || 0}</span>
            <span className="text-[10px] text-teal-200">مواد</span>
          </div>
          <div>
            <span className="block font-black text-sm">{summary?.questionsAnswered || 0}</span>
            <span className="text-[10px] text-teal-200">أسئلة</span>
          </div>
          <div>
            <span className="block font-black text-sm text-red-300">{summary?.currentMistakes || 0}</span>
            <span className="text-[10px] text-teal-200">أخطاء</span>
          </div>
          <div>
            <span className="block font-black text-sm text-amber-300">{summary?.topicsNeedingReview || 0}</span>
            <span className="text-[10px] text-teal-200">مواضيع للمراجعة</span>
          </div>
        </div>
      </div>

      {/* Next Recommendation */}
      {recommendation && (
        <div className="p-4 rounded-3xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs space-y-2">
          <div className="flex items-center gap-1.5 font-black text-amber-900 dark:text-amber-200">
            <Target className="size-4 text-amber-600" />
            <span>توصية المراجعة التالية</span>
          </div>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            {recommendation}
          </p>
          {weakTopics[0] && (
            <button
              onClick={() => handleLaunchTargeted(weakTopics[0].subjectId, weakTopics[0].topicKey)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-white font-bold text-[11px] active:scale-95"
            >
              <Play className="size-3" />
              <span>تدرب على أضعف موضوع</span>
            </button>
          )}
        </div>
      )}

      {/* Subjects Progress */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider px-1">
          تقدم المواد
        </h3>

        <div className="space-y-2.5">
          {subjects.map((sub: any) => (
            <div
              key={sub.subjectId}
              className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900 dark:text-white">
                  {sub.subjectName}
                </span>
                <span className="font-black text-primary">
                  {sub.masteryScore != null ? `${sub.masteryScore}%` : "—"}
                </span>
              </div>

              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${sub.masteryScore || 0}%` }}
                />
              </div>

              <p className="text-[10px] text-slate-400">
                {sub.topicsStudied} مواضيع · {sub.questionsAnswered} أسئلة مجابة
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Weak Topics */}
      {weakTopics.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="text-xs font-black text-amber-700 dark:text-amber-400 uppercase tracking-wider px-1">
            مواضيع تحتاج انتباهك
          </h3>

          <div className="space-y-2">
            {weakTopics.map((topic: any) => (
              <div
                key={`${topic.subjectId}-${topic.topicKey}`}
                className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/50 shadow-xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      {topic.topicName}
                    </h4>
                    <span className="text-[10px] text-slate-400">{topic.subjectName}</span>
                  </div>
                  <span className="text-xs font-black text-amber-600">
                    {topic.masteryScore}%
                  </span>
                </div>

                <button
                  onClick={() => handleLaunchTargeted(topic.subjectId, topic.topicKey)}
                  className="w-full flex items-center justify-center gap-1.5 h-8 rounded-xl bg-amber-50 dark:bg-slate-800 text-amber-700 dark:text-amber-300 font-bold text-[11px] active:scale-95 transition-all"
                >
                  <Play className="size-3" />
                  <span>تدرب على هذا الموضوع</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
