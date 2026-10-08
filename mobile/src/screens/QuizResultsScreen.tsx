import React from "react";
import { Award, CheckCircle2, XCircle } from "lucide-react";
import { useNavigation } from "../context/NavigationContext";

export function QuizResultsScreen({
  scorePercent = 0,
  correctCount = 0,
  totalQuestions = 0,
  timeSpent = "00:00",
  results = [],
}: {
  scorePercent: number;
  correctCount: number;
  totalQuestions: number;
  timeSpent: string;
  results: any[];
}) {
  const { navigate, switchTab } = useNavigation();

  let gradeBadge = "بحاجة لمزيد من المراجعة";
  let gradeColor = "text-amber-600 bg-amber-50 border-amber-200";

  if (scorePercent >= 85) {
    gradeBadge = "أداء ممتاز ومتقن 🌟";
    gradeColor = "text-emerald-700 bg-emerald-50 border-emerald-200";
  } else if (scorePercent >= 70) {
    gradeBadge = "أداء جيد جدًا 👍";
    gradeColor = "text-teal-700 bg-teal-50 border-teal-200";
  }

  const wrongCount = totalQuestions - correctCount;

  return (
    <div className="space-y-5 pb-nav">
      {/* Score Summary Card */}
      <div className="rounded-3xl bg-linear-to-l from-slate-900 to-primary p-6 text-white text-center shadow-lg relative overflow-hidden space-y-3">
        <div className="flex size-16 items-center justify-center rounded-3xl bg-white/20 mx-auto backdrop-blur-md">
          <Award className="size-8 text-teal-200" />
        </div>

        <div>
          <span className="text-4xl font-black">{scorePercent}%</span>
          <p className="text-xs text-teal-100 font-bold mt-1">النتيجة النهائية</p>
        </div>

        <div className={`inline-block px-4 py-1.5 rounded-full text-xs font-black border ${gradeColor}`}>
          {gradeBadge}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/20 text-center text-xs">
          <div>
            <span className="block font-black text-emerald-300">{correctCount}</span>
            <span className="text-[10px] text-teal-100">إجابات صحيحة</span>
          </div>
          <div>
            <span className="block font-black text-red-300">{wrongCount}</span>
            <span className="text-[10px] text-teal-100">إجابات خاطئة</span>
          </div>
          <div>
            <span className="block font-black text-white">{timeSpent}</span>
            <span className="text-[10px] text-teal-100">الوقت المستغرق</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => navigate("mistakes")}
          className="flex-1 h-12 rounded-2xl bg-amber-500 text-white font-bold text-xs shadow-xs active:scale-97 transition-all flex items-center justify-center gap-1.5"
        >
          <span>عرض سجل أخطائي</span>
        </button>

        <button
          onClick={() => switchTab("home")}
          className="flex-1 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs active:scale-97 transition-all flex items-center justify-center gap-1.5"
        >
          <span>الرئيسية</span>
        </button>
      </div>

      {/* Question Breakdown List */}
      <div className="space-y-3">
        <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider px-1">
          تفاصيل الأسئلة
        </h3>

        {results.map((r, idx) => (
          <div
            key={idx}
            className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2.5"
          >
            <div className="flex items-start gap-2.5">
              {r.isCorrect ? (
                <CheckCircle2 className="size-4.5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="size-4.5 text-red-600 shrink-0 mt-0.5" />
              )}
              <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-relaxed">
                {r.questionText}
              </h4>
            </div>

            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3 space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">إجابتك:</span>
                <span className={`font-bold ${r.isCorrect ? "text-emerald-600" : "text-red-600"}`}>
                  {r.userChoice || "لم تجب"}
                </span>
              </div>
              {!r.isCorrect && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">الإجابة الصحيحة:</span>
                  <span className="font-bold text-emerald-600">{r.correctChoice}</span>
                </div>
              )}
              {r.explanation && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 leading-relaxed">
                  💡 {r.explanation}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
