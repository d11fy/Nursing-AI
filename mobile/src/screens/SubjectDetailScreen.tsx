import React, { useEffect, useState, useCallback } from "react";
import {
  BookOpen,
  Sparkles,
  FileText,
  BarChart3,
  Upload,
  Play,
  TrendingUp,
  MessageSquare,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
} from "lucide-react";
import { useNavigation } from "../context/NavigationContext";
import { ApiError, apiFetch, apiUpload } from "../services/api";
import { BottomSheet } from "../components/common/BottomSheet";

export function SubjectDetailScreen({ subjectId }: { subjectId: string }) {
  const { navigate, switchTab } = useNavigation();

  const [activeTab, setActiveTab] = useState<
    "lectures" | "smart" | "exams" | "insights"
  >("lectures");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload lecture sheet
  const [showUploadSheet, setShowUploadSheet] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [largeFileAcknowledged, setLargeFileAcknowledged] = useState(false);
  const [contributionConsent, setContributionConsent] = useState(false);
  const [contributionOwnership, setContributionOwnership] = useState(false);
  const [duplicateLecture, setDuplicateLecture] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Smart Practice settings
  const [practiceType, setPracticeType] = useState<
    "UNIVERSITY_STYLE" | "PAST_EXAM" | "MIXED"
  >("UNIVERSITY_STYLE");
  const [examMode, setExamMode] = useState<"STUDY" | "EXAM">("STUDY");
  const [questionCount, setQuestionCount] = useState("10");
  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">(
    "MEDIUM",
  );
  const [generatingPractice, setGeneratingPractice] = useState(false);

  const loadSubjectData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/subjects/${subjectId}`);
      setData(res);
    } catch (err: any) {
      setError(err.message || "تعذر تحميل بيانات المادة");
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    loadSubjectData();
  }, [loadSubjectData]);

  const handleStartSmartPractice = async (
    overrideType?: any,
    topicOverride?: string,
  ) => {
    setGeneratingPractice(true);
    try {
      const res = await apiFetch("/api/practice/generate", {
        method: "POST",
        body: JSON.stringify({
          subjectId,
          topic: topicOverride,
          questionCount: parseInt(questionCount, 10),
          difficulty,
          practiceType: overrideType || practiceType,
          mode: examMode,
        }),
      });

      if (!res.questions || res.questions.length === 0) {
        alert("لا توجد أسئلة معتمدة كافية لهذا الاختيار حاليًا.");
        return;
      }

      navigate("quiz-runner", {
        attemptId: res.attemptId,
        mode: res.mode,
        questions: res.questions,
        practiceType: res.practiceType,
        subjectId,
        subjectName: data?.subject?.name_ar,
      });
    } catch (err: any) {
      alert(err.message || "تعذر بدء الاختبار التدريبي");
    } finally {
      setGeneratingPractice(false);
    }
  };

  const handleUploadLecture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError("يرجى اختيار ملف المحاضرة");
      return;
    }
    if (
      data?.settings?.lectureMaxFileMb &&
      uploadFile.size > data.settings.lectureMaxFileMb * 1024 * 1024
    ) {
      setUploadError(`الحد الأقصى للملف ${data.settings.lectureMaxFileMb}MB`);
      return;
    }
    if (
      uploadFile.size >
        (data?.settings?.lectureLargeFileMb || 20) * 1024 * 1024 &&
      !largeFileAcknowledged
    ) {
      setUploadError("يرجى الموافقة على تنبيه الملف الكبير أولًا");
      return;
    }
    if (contributionConsent && !contributionOwnership) {
      setUploadError("أكد ملكيتك وحق مشاركة الملف أولًا");
      return;
    }
    setDuplicateLecture(null);
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      form.append(
        "title",
        uploadTitle.trim() || uploadFile.name.replace(/\.[^/.]+$/, ""),
      );
      form.append("subjectId", subjectId);
      form.append("largeFileAcknowledged", String(largeFileAcknowledged));
      form.append("contributionConsent", String(contributionConsent));
      form.append(
        "contributionOwnershipConfirmed",
        String(contributionOwnership),
      );

      await apiUpload("/api/lectures", form);
      setShowUploadSheet(false);
      setUploadFile(null);
      setUploadTitle("");
      setContributionConsent(false);
      setContributionOwnership(false);
      setLargeFileAcknowledged(false);
      await loadSubjectData();
    } catch (err: any) {
      if (err instanceof ApiError && err.data?.duplicate)
        setDuplicateLecture({
          id: err.data.existingLectureId,
          title: err.data.existingTitle,
        });
      setUploadError(err.message || "تعذر رفع المحاضرة");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-3">
        <RefreshCw className="size-6 text-primary animate-spin" />
        <span className="text-xs text-slate-400">
          جارٍ تجهيز مساحة المادة...
        </span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-center space-y-3 my-6">
        <AlertCircle className="size-8 text-red-500 mx-auto" />
        <p className="text-xs text-red-600 font-bold">
          {error || "المادة غير متوفرة"}
        </p>
        <button
          onClick={loadSubjectData}
          className="px-4 py-2 rounded-xl bg-red-600 text-white font-bold text-xs"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const {
    subject,
    lectures,
    pastExams,
    repeatedTopics,
    smartReviewRecommendations,
    learningProgress,
  } = data;

  return (
    <div className="space-y-4 pb-nav">
      {/* Subject Hero Header */}
      <div className="rounded-3xl bg-linear-to-l from-slate-900 to-primary p-5 text-white shadow-md relative overflow-hidden">
        <div className="space-y-3 relative z-10">
          <div>
            <span className="inline-flex rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-mono font-bold">
              {subject.course_code || "مقرر تمريضي"}
            </span>
            <h2 className="text-lg font-black mt-1.5">{subject.name_ar}</h2>
            <p className="text-xs text-teal-100 font-medium" dir="ltr">
              {subject.name_en}
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => {
                switchTab("chat");
                navigate("chat-detail", {
                  subjectId: subject.id,
                  subjectName: subject.name_ar,
                });
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-primary text-xs font-bold active:scale-95 transition-all shadow-xs"
            >
              <MessageSquare className="size-3.5" />
              <span>محادثة المعلم للمادة</span>
            </button>
            <button
              onClick={() => setShowUploadSheet(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/20 text-white text-xs font-bold active:scale-95 transition-all"
            >
              <Upload className="size-3.5" />
              <span>رفع محاضرة</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mastery Progress Card */}
      {learningProgress?.subject && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
              <TrendingUp className="size-3.5 text-primary" />
              مستوى الإتقان المقاس
            </span>
            <strong className="text-primary font-black">
              {learningProgress.subject.masteryScore ?? 0}%
            </strong>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{
                width: `${learningProgress.subject.masteryScore ?? 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Tabs Switcher */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab("lectures")}
          className={`flex items-center gap-1.5 py-2.5 px-3 border-b-2 font-bold text-xs whitespace-nowrap transition-all ${
            activeTab === "lectures"
              ? "border-primary text-primary"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <BookOpen className="size-3.5" />
          <span>المحاضرات ({lectures.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("smart")}
          className={`flex items-center gap-1.5 py-2.5 px-3 border-b-2 font-bold text-xs whitespace-nowrap transition-all ${
            activeTab === "smart"
              ? "border-primary text-primary"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Sparkles className="size-3.5" />
          <span>تدريب ذكي</span>
        </button>

        <button
          onClick={() => setActiveTab("exams")}
          className={`flex items-center gap-1.5 py-2.5 px-3 border-b-2 font-bold text-xs whitespace-nowrap transition-all ${
            activeTab === "exams"
              ? "border-primary text-primary"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <FileText className="size-3.5" />
          <span>نماذج سابقة ({pastExams.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("insights")}
          className={`flex items-center gap-1.5 py-2.5 px-3 border-b-2 font-bold text-xs whitespace-nowrap transition-all ${
            activeTab === "insights"
              ? "border-primary text-primary"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <BarChart3 className="size-3.5" />
          <span>تحليل الامتحانات</span>
        </button>
      </div>

      {/* TAB 1: Lectures */}
      {activeTab === "lectures" && (
        <div className="space-y-3">
          {lectures.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-400 space-y-3">
              <p>لا توجد محاضرات مرفوعة لهذه المادة حتى الآن.</p>
              <button
                onClick={() => setShowUploadSheet(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white font-bold text-xs"
              >
                <Upload className="size-3.5" />
                <span>رفع أول محاضرة</span>
              </button>
            </div>
          ) : (
            lectures.map((lec: any) => (
              <div
                key={lec.id}
                onClick={() =>
                  navigate("study-pack", {
                    id: lec.id,
                    type: "lecture",
                    title: lec.title,
                  })
                }
                className="flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs active:scale-98 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 dark:bg-teal-950/60 text-primary">
                    <BookOpen className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-black text-slate-900 dark:text-white truncate">
                      {lec.title}
                    </h4>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {lec.file_name} ·{" "}
                      {lec.status === "ready"
                        ? "جاهزة للدراسة"
                        : "جارٍ المعالجة"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-teal-50 dark:bg-slate-800 text-primary px-2.5 py-1 text-[10px] font-bold">
                    Study Pack
                  </span>
                  <ChevronLeft className="size-4 text-slate-400" />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: Smart Training */}
      {activeTab === "smart" && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-xs">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                توليد امتحان تدريبي بنمط الجامعة
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                يحلل النظام صياغة أسئلة الامتحانات السابقة ويولد أسئلة جديدة
                موثقة ومربوطة بمصادر المنهج.
              </p>
            </div>

            <div className="space-y-3">
              {/* Practice Type */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  نمط الأسئلة
                </label>
                <select
                  value={practiceType}
                  onChange={(e: any) => setPracticeType(e.target.value)}
                  className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 text-xs font-bold"
                >
                  <option value="UNIVERSITY_STYLE">
                    أسئلة جديدة بنمط امتحانات الجامعة
                  </option>
                  <option value="PAST_EXAM">
                    أسئلة أصلية من الامتحانات السابقة
                  </option>
                  <option value="MIXED">تدريب مختلط (سابق + نمط جامعي)</option>
                </select>
              </div>

              {/* Mode */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  طريقة الاختبار
                </label>
                <select
                  value={examMode}
                  onChange={(e: any) => setExamMode(e.target.value)}
                  className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 text-xs font-bold"
                >
                  <option value="STUDY">
                    نمط الدراسة (عرض الشرح والمصدر فورًا بعد كل سؤال)
                  </option>
                  <option value="EXAM">
                    نمط الامتحان (حجب الإجابات حتى الانتهاء وحساب النتيجة)
                  </option>
                </select>
              </div>

              {/* Question Count & Difficulty */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    عدد الأسئلة
                  </label>
                  <select
                    value={questionCount}
                    onChange={(e) => setQuestionCount(e.target.value)}
                    className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 text-xs font-bold"
                  >
                    <option value="5">5 أسئلة سريعة</option>
                    <option value="10">10 أسئلة (قياسي)</option>
                    <option value="15">15 سؤالًا</option>
                    <option value="20">20 سؤالًا (كامل)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    الصعوبة
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e: any) => setDifficulty(e.target.value)}
                    className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 text-xs font-bold"
                  >
                    <option value="EASY">سهل</option>
                    <option value="MEDIUM">متوسط</option>
                    <option value="HARD">متقدم</option>
                  </select>
                </div>
              </div>
            </div>

            <button
              onClick={() => handleStartSmartPractice()}
              disabled={generatingPractice}
              className="w-full h-12 rounded-2xl bg-primary text-white font-bold text-sm shadow-md active:scale-97 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Play className="size-4" />
              <span>
                {generatingPractice
                  ? "جارٍ تجهيز الامتحان..."
                  : "ابدأ التدريب الآن"}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: Past Exams */}
      {activeTab === "exams" && (
        <div className="space-y-3">
          {pastExams.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-400">
              لا توجد نماذج امتحانات سابقة لهذه المادة حتى الآن.
            </div>
          ) : (
            pastExams.map((exam: any) => (
              <div
                key={exam.id}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-black text-slate-900 dark:text-white">
                      {exam.title}
                    </h4>
                    {exam.doctor_name && (
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        إعداد: د. {exam.doctor_name}
                      </p>
                    )}
                  </div>
                  <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                    {exam.exam_type}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
                  <span>{exam.verified_questions} سؤال معتمد</span>
                  <button
                    onClick={() => handleStartSmartPractice("PAST_EXAM")}
                    className="flex items-center gap-1 font-bold text-primary active:scale-95 transition-all"
                  >
                    <Play className="size-3" />
                    <span>ابدأ الامتحان</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 4: Insights */}
      {activeTab === "insights" && (
        <div className="space-y-4">
          {/* Smart Review Recommendations */}
          {smartReviewRecommendations.length > 0 && (
            <div className="rounded-3xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 p-4 space-y-3">
              <h4 className="text-xs font-black text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <Sparkles className="size-4 text-amber-600" />
                توصيات المراجعة الذكية
              </h4>
              <div className="space-y-2">
                {smartReviewRecommendations.map((rec: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-amber-100 dark:border-amber-900/40 text-xs space-y-2"
                  >
                    <div>
                      <span className="font-black text-slate-900 dark:text-white block">
                        {rec.topic}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        {rec.recommendationMessage}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        handleStartSmartPractice("MIXED", rec.topic)
                      }
                      className="px-3 py-1.5 rounded-xl bg-amber-500 text-white font-bold text-[11px] active:scale-95"
                    >
                      تدرب على هذا الموضوع
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Repeated Topics */}
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
            <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <BarChart3 className="size-4 text-primary" />
              أكثر المواضيع تكرارًا في الامتحانات
            </h4>

            {repeatedTopics.length > 0 ? (
              <div className="space-y-3">
                {repeatedTopics.map((topic: any) => (
                  <div key={topic.topic} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-800 dark:text-slate-200">
                        {topic.topic}
                      </span>
                      <span className="text-primary">
                        {topic.frequencyPercentage}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${topic.frequencyPercentage}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400">
                      {topic.phrasingLabel}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-4">
                لا توجد إحصائيات مواضيع متكررة متوفرة حاليًا.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Upload Lecture Sheet */}
      <BottomSheet
        isOpen={showUploadSheet}
        onClose={() => setShowUploadSheet(false)}
        title="رفع محاضرة جديدة"
      >
        <form onSubmit={handleUploadLecture} className="space-y-4">
          {duplicateLecture && (
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => {
                setShowUploadSheet(false);
                navigate("study-pack", {
                  id: duplicateLecture.id,
                  type: "lecture",
                  title: duplicateLecture.title,
                });
              }}
            >
              فتح المحاضرة المرفوعة سابقًا
            </button>
          )}
          {uploadError && (
            <div className="p-3 rounded-xl bg-red-50 text-red-600 text-xs font-bold">
              {uploadError}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">
              عنوان المحاضرة
            </label>
            <input
              type="text"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="مثال: المحاضرة الثالثة - العناية التمريضية"
              className="w-full h-11 rounded-xl border border-slate-200 px-3 text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">
              الملف (PDF, DOCX, PPTX, TXT)
            </label>
            <input
              type="file"
              accept=".pdf,.docx,.pptx,.txt"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              required
              className="w-full h-11 rounded-xl border border-slate-200 p-1.5 text-xs"
            />
          </div>

          {uploadFile &&
            uploadFile.size >
              (data?.settings?.lectureLargeFileMb || 20) * 1024 * 1024 && (
              <label className="flex gap-3 text-sm leading-6">
                <input
                  type="checkbox"
                  checked={largeFileAcknowledged}
                  onChange={(e) => setLargeFileAcknowledged(e.target.checked)}
                />
                أفهم أن الملف الكبير قد يُحذف أصله تلقائيًا بحسب سياسة الملفات،
                مع بقاء محتوى الدراسة.
              </label>
            )}
          <label className="flex gap-3 text-sm leading-6">
            <input
              type="checkbox"
              checked={contributionConsent}
              onChange={(e) => setContributionConsent(e.target.checked)}
            />
            أرغب بمشاركة هذا الملف في المكتبة بعد مراجعة الإدارة (اختياري).
          </label>
          {contributionConsent && (
            <label className="flex gap-3 text-sm leading-6">
              <input
                type="checkbox"
                checked={contributionOwnership}
                onChange={(e) => setContributionOwnership(e.target.checked)}
              />
              أؤكد أن لدي الحق في مشاركة هذا الملف.
            </label>
          )}
          <button
            type="submit"
            disabled={uploading}
            className="w-full h-12 rounded-2xl bg-primary text-white font-bold text-xs shadow-md active:scale-97 disabled:opacity-60"
          >
            {uploading ? "جارٍ الرفع والمعالجة..." : "تأكيد الرفع"}
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}
