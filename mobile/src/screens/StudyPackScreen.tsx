import React, { useEffect, useState } from "react";
import {
  FileText,
  ListOrdered,
  Layers,
  Sparkles,
  HelpCircle,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertCircle,
  BookOpen,
} from "lucide-react";
import { useNavigation } from "../context/NavigationContext";
import { apiFetch } from "../services/api";
import { FlashcardsViewer } from "../components/studypack/FlashcardsViewer";

export function StudyPackScreen({
  id,
  type,
  title,
}: {
  id?: string;
  type?: "lecture" | "library";
  title?: string;
}) {
  const { navigate } = useNavigation();

  const [activeTab, setActiveTab] = useState<"summary" | "keypoints" | "flashcards" | "quiz">("summary");
  const [data, setData] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Flashcards state
  const [flashcards, setFlashcards] = useState<any[]>([]);

  // Quiz Setup state
  const [quizCount, setQuizCount] = useState("10");
  const [quizDifficulty, setQuizDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  const loadWorkspace = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      if (!id) throw new Error("معرّف حزمة الدراسة غير متوفر");
      const query = type ? `?type=${type}` : "";
      const res = await apiFetch(`/api/study-packs/${id}${query}`);
      setData(res.workspaceData);

      // If flashcards already exist, load them
      if (res.workspaceData?.studyPack?.id) {
        try {
          const cardsRes = await apiFetch(`/api/study-packs/${res.workspaceData.studyPack.id}/flashcards`);
          if (cardsRes.cards) setFlashcards(cardsRes.cards);
        } catch {}
      }
    } catch (error) {
      setData(null);
      setErrorMessage(error instanceof Error ? error.message : "تعذر تحميل حزمة الدراسة");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, [id, type]);

  const studyPackId = data?.studyPack?.id;

  // Generate Summary / Key Points
  const handleGenerateContent = async (contentType: "summary" | "key_points") => {
    if (!studyPackId) return;
    setGenerating(true);
    try {
      const res = await apiFetch(`/api/study-packs/${studyPackId}/content`, {
        method: "POST",
        body: JSON.stringify({ type: contentType, regenerate: false }),
      });
      if (contentType === "summary") {
        setData((prev: any) => ({
          ...prev,
          summaryStatus: "ready",
          initialSummary: res.content,
        }));
      } else {
        setData((prev: any) => ({
          ...prev,
          keyPointsStatus: "ready",
          initialKeyPoints: res.content,
        }));
      }
    } catch (err: any) {
      alert(err.message || "فشل توليد المحتوى، يرجى المحاولة لاحقًا");
    } finally {
      setGenerating(false);
    }
  };

  // Generate Flashcards
  const handleGenerateFlashcards = async () => {
    if (!studyPackId) return;
    setGenerating(true);
    try {
      const res = await apiFetch(`/api/study-packs/${studyPackId}/flashcards`, {
        method: "POST",
        body: JSON.stringify({ regenerate: false }),
      });
      if (res.cards) {
        setFlashcards(res.cards);
      }
    } catch (err: any) {
      alert(err.message || "فشل إنشاء البطاقات التعليمية");
    } finally {
      setGenerating(false);
    }
  };

  // Generate & Launch Quiz
  const handleStartQuiz = async () => {
    if (!studyPackId) return;
    setGenerating(true);
    try {
      const res = await apiFetch(`/api/study-packs/${studyPackId}/quiz`, {
        method: "POST",
        body: JSON.stringify({
          config: {
            questionCount: parseInt(quizCount, 10),
            difficulty: quizDifficulty,
            questionType: "mixed",
          },
        }),
      });

      if (!res.quiz?.questions || res.quiz.questions.length === 0) {
        alert("تعذر توليد أسئلة الاختبار، حاول مجددًا.");
        return;
      }

      navigate("quiz-runner", {
        quizId: res.quiz.id,
        studyPackId,
        questions: res.quiz.questions,
        mode: "STUDY",
        title: res.quiz.title || "اختبار حزمة الدراسة",
      });
    } catch (err: any) {
      alert(err.message || "تعذر بدء الاختبار");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-3">
        <RefreshCw className="size-6 text-primary animate-spin" />
        <span className="text-xs text-slate-400">جارٍ تجهيز حزمة الدراسة...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-center space-y-3 my-6">
        <AlertCircle className="size-8 text-red-500 mx-auto" />
        <p className="text-xs text-red-700 font-bold">
          {errorMessage || "تعذر العثور على حزمة الدراسة."}
        </p>
        <button
          onClick={loadWorkspace}
          className="px-4 py-2 rounded-xl bg-red-600 text-white font-bold text-xs"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const lectureTitle = data.lecture?.title || title || "حزمة الدراسة";
  const subjectName = data.subject?.nameAr || "مادة دراسية";

  return (
    <div className="space-y-4 pb-nav">
      {/* Header Banner */}
      <div className="rounded-3xl bg-linear-to-l from-slate-900 to-teal-900 p-5 text-white shadow-md space-y-1">
        <span className="text-[10px] font-bold text-teal-300">
          {subjectName} · Study Pack
        </span>
        <h2 className="text-base font-black leading-snug">{lectureTitle}</h2>
      </div>

      {/* Tabs Row */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab("summary")}
          className={`flex items-center gap-1.5 py-2 px-3 border-b-2 font-bold text-xs whitespace-nowrap transition-all ${
            activeTab === "summary"
              ? "border-primary text-primary"
              : "border-transparent text-slate-500"
          }`}
        >
          <FileText className="size-3.5" />
          <span>الملخص</span>
        </button>

        <button
          onClick={() => setActiveTab("keypoints")}
          className={`flex items-center gap-1.5 py-2 px-3 border-b-2 font-bold text-xs whitespace-nowrap transition-all ${
            activeTab === "keypoints"
              ? "border-primary text-primary"
              : "border-transparent text-slate-500"
          }`}
        >
          <ListOrdered className="size-3.5" />
          <span>أهم النقاط</span>
        </button>

        <button
          onClick={() => setActiveTab("flashcards")}
          className={`flex items-center gap-1.5 py-2 px-3 border-b-2 font-bold text-xs whitespace-nowrap transition-all ${
            activeTab === "flashcards"
              ? "border-primary text-primary"
              : "border-transparent text-slate-500"
          }`}
        >
          <Layers className="size-3.5" />
          <span>البطاقات ({flashcards.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("quiz")}
          className={`flex items-center gap-1.5 py-2 px-3 border-b-2 font-bold text-xs whitespace-nowrap transition-all ${
            activeTab === "quiz"
              ? "border-primary text-primary"
              : "border-transparent text-slate-500"
          }`}
        >
          <HelpCircle className="size-3.5" />
          <span>اختبار سريع</span>
        </button>
      </div>

      {/* TAB 1: Summary */}
      {activeTab === "summary" && (
        <div className="space-y-4">
          {data.summaryStatus === "ready" && data.initialSummary ? (
            <div className="space-y-4 selectable-text">
              <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
                <h3 className="text-xs font-black text-primary">نظرة عامة على المحاضرة</h3>
                <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  {data.initialSummary.overview}
                </p>
              </div>

              {data.initialSummary.sections?.map((sec: any, idx: number) => (
                <div
                  key={idx}
                  className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs"
                >
                  <h4 className="text-xs font-black text-slate-900 dark:text-white">
                    {sec.heading}
                  </h4>
                  <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {sec.summary}
                  </p>
                  {sec.clinicalTakeaway && (
                    <div className="rounded-2xl bg-teal-50 dark:bg-slate-800 p-2.5 text-[11px] font-bold text-primary dark:text-teal-300">
                      💉 <strong>تطبيق تمريضي:</strong> {sec.clinicalTakeaway}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center space-y-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-teal-50 text-primary mx-auto">
                <FileText className="size-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  الملخص الذكي غير مولّد بعد
                </h4>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                  يمكن للذكاء الاصطناعي استخراج ملخص شامل منظم بالأقسام والتطبيقات السريرية.
                </p>
              </div>
              <button
                onClick={() => handleGenerateContent("summary")}
                disabled={generating}
                className="inline-flex items-center gap-2 px-5 h-11 rounded-2xl bg-primary text-white text-xs font-bold active:scale-97 disabled:opacity-60 shadow-xs"
              >
                <Sparkles className="size-3.5" />
                <span>{generating ? "جارٍ التوليد..." : "توليد الملخص الآن"}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Key Points */}
      {activeTab === "keypoints" && (
        <div className="space-y-4">
          {data.keyPointsStatus === "ready" && data.initialKeyPoints ? (
            <div className="space-y-3 selectable-text">
              {data.initialKeyPoints.points?.map((point: any, idx: number) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-start gap-3"
                >
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold mt-0.5">
                    {idx + 1}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-relaxed">
                      {point.text || point.point}
                    </p>
                    {point.examAlert && (
                      <span className="inline-block rounded-md bg-amber-50 text-amber-700 px-2 py-0.5 text-[10px] font-bold">
                        ⚠️ موضع امتحان متكرر
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center space-y-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-teal-50 text-primary mx-auto">
                <ListOrdered className="size-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  أهم النقاط السريرية غير مولّدة
                </h4>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                  استخرج أهم النقاط ذات الأولوية العالية للامتحانات والممارسة التمريضية.
                </p>
              </div>
              <button
                onClick={() => handleGenerateContent("key_points")}
                disabled={generating}
                className="inline-flex items-center gap-2 px-5 h-11 rounded-2xl bg-primary text-white text-xs font-bold active:scale-97 disabled:opacity-60 shadow-xs"
              >
                <Sparkles className="size-3.5" />
                <span>{generating ? "جارٍ التوليد..." : "توليد أهم النقاط"}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Flashcards */}
      {activeTab === "flashcards" && (
        <div className="space-y-4">
          {flashcards.length > 0 ? (
            <FlashcardsViewer studyPackId={studyPackId} cards={flashcards} />
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center space-y-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-teal-50 text-primary mx-auto">
                <Layers className="size-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  لا توجد بطاقات تعليمية حتى الآن
                </h4>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                  أنشئ بطاقات ذكية للحفظ والتكرار المتباعد لهذه المحاضرة.
                </p>
              </div>
              <button
                onClick={handleGenerateFlashcards}
                disabled={generating}
                className="inline-flex items-center gap-2 px-5 h-11 rounded-2xl bg-primary text-white text-xs font-bold active:scale-97 disabled:opacity-60 shadow-xs"
              >
                <Sparkles className="size-3.5" />
                <span>{generating ? "جارٍ الإنشاء..." : "توليد البطاقات التعليمية"}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Quiz Setup */}
      {activeTab === "quiz" && (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-xs">
          <div className="space-y-1">
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <HelpCircle className="size-4 text-primary" />
              اختبار سريع على هذه المحاضرة
            </h3>
            <p className="text-xs text-slate-500">
              اختبر مدى استيعابك للمفاهيم الأساسية مع الشرح الفوري للإجابات.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700">عدد الأسئلة</label>
              <select
                value={quizCount}
                onChange={(e) => setQuizCount(e.target.value)}
                className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 px-3 text-xs font-bold"
              >
                <option value="5">5 أسئلة</option>
                <option value="10">10 أسئلة</option>
                <option value="15">15 سؤالًا</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700">المستوى</label>
              <select
                value={quizDifficulty}
                onChange={(e: any) => setQuizDifficulty(e.target.value)}
                className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 px-3 text-xs font-bold"
              >
                <option value="easy">سهل</option>
                <option value="medium">متوسط</option>
                <option value="hard">متقدم</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleStartQuiz}
            disabled={generating}
            className="w-full h-12 rounded-2xl bg-primary text-white font-bold text-xs shadow-md active:scale-97 disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
          >
            <Play className="size-4" />
            <span>{generating ? "جارٍ إعداد الأسئلة..." : "بدء الاختبار الآن"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
