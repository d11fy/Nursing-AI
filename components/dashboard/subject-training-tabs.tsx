"use client";

import { useState, type ComponentProps } from "react";
import {
  Sparkles,
  Play,
  BarChart3,
  ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LectureUploadDialog } from "@/components/dashboard/lecture-upload-dialog";
import { LectureCard } from "@/components/dashboard/lecture-card";
import { PracticeExamRunner } from "@/components/dashboard/practice-exam-runner";
import type { StudentPracticeQuestion } from "@/lib/exams/practice-service";
import type { TopicRecurrenceStat } from "@/lib/exams/analytics-service";

const practiceTypeLabels = {
  UNIVERSITY_STYLE: "نمط الجامعة",
  PAST_EXAM: "امتحانات سابقة",
  MIXED: "تدريب مختلط",
} as const;

const examModeLabels = { STUDY: "نمط الدراسة", EXAM: "نمط الامتحان" } as const;
const practiceDifficultyLabels = { EASY: "سهل", MEDIUM: "متوسط", HARD: "متقدم" } as const;

interface PastExamItem {
  id: string;
  title: string;
  exam_year: number | null;
  semester: number | null;
  exam_type: string;
  doctor_name: string | null;
  total_questions: number;
  verified_questions: number;
}

interface SmartReviewItem {
  topic: string;
  examFrequency: number;
  studentMastery: number | null;
  recommendationMessage: string;
}

export function SubjectTrainingTabs({
  subjectId,
  subjectName,
  lectures,
  pastExams,
  repeatedTopics,
  smartReviewRecommendations,
  lectureLargeFileMb,
  lectureMaxFileMb,
}: {
  subjectId: string;
  subjectName: string;
  lectures: ComponentProps<typeof LectureCard>["lecture"][];
  pastExams: PastExamItem[];
  repeatedTopics: TopicRecurrenceStat[];
  smartReviewRecommendations: SmartReviewItem[];
  lectureLargeFileMb: number;
  lectureMaxFileMb: number;
}) {
  const [activeSession, setActiveSession] = useState<{
    attemptId: string;
    mode: "STUDY" | "EXAM";
    practiceType: string;
    questions: StudentPracticeQuestion[];
  } | null>(null);

  const [loadingExam, setLoadingExam] = useState(false);
  const [practiceType, setPracticeType] = useState<"PAST_EXAM" | "UNIVERSITY_STYLE" | "MIXED">("UNIVERSITY_STYLE");
  const [examMode, setExamMode] = useState<"STUDY" | "EXAM">("STUDY");
  const [questionCount, setQuestionCount] = useState<string>("10");
  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const [selectedTopic, setSelectedTopic] = useState<string>("all");

  async function handleStartPractice(overridePracticeType?: "PAST_EXAM" | "UNIVERSITY_STYLE" | "MIXED", topicOverride?: string) {
    setLoadingExam(true);
    try {
      const res = await fetch("/api/practice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId,
          topic: topicOverride || (selectedTopic === "all" ? undefined : selectedTopic),
          questionCount: parseInt(questionCount, 10),
          difficulty,
          practiceType: overridePracticeType || practiceType,
          mode: examMode,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل بدء الاختبار");
      if (!data.questions || data.questions.length === 0) {
        toast.info("لا توجد أسئلة معتمدة كافية لهذا الاختيار حاليًا.");
        return;
      }

      setActiveSession(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setLoadingExam(false);
    }
  }

  // If active practice session is running, render the full practice runner
  if (activeSession) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setActiveSession(null)}
          className="text-muted-foreground hover:text-foreground mb-2"
        >
          <ChevronLeft className="size-4 ml-1" />
          العودة للمادة
        </Button>
        <PracticeExamRunner
          attemptId={activeSession.attemptId}
          mode={activeSession.mode}
          practiceType={activeSession.practiceType}
          questions={activeSession.questions}
          onClose={() => setActiveSession(null)}
        />
      </div>
    );
  }

  return (
    <Tabs defaultValue="lectures" className="space-y-4">
      <TabsList className="flex h-auto w-full snap-x flex-nowrap justify-start gap-1 overflow-x-auto border bg-muted/60 p-1 scrollbar-none [&_[data-slot=tabs-trigger]]:min-h-11 [&_[data-slot=tabs-trigger]]:snap-start [&_[data-slot=tabs-trigger]]:shrink-0">
        <TabsTrigger value="lectures" className="text-xs sm:text-sm font-semibold">
          المحاضرات ({lectures.length})
        </TabsTrigger>
        <TabsTrigger value="smart-training" className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" />
          تدريب ذكي
        </TabsTrigger>
        <TabsTrigger value="past-exams" className="text-xs sm:text-sm font-semibold">
          نماذج سابقة ({pastExams.length})
        </TabsTrigger>
        <TabsTrigger value="exam-insights" className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
          <BarChart3 className="size-3.5 text-primary" />
          تحليل الامتحانات
        </TabsTrigger>
      </TabsList>

      {/* Tab 1: Lectures (Original Feature preserved 100%) */}
      <TabsContent value="lectures" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-bold text-foreground">محاضراتي الخاصة في {subjectName}</h3>
          <LectureUploadDialog subjectId={subjectId} largeFileMb={lectureLargeFileMb} maxFileMb={lectureMaxFileMb} />
        </div>
        {lectures && lectures.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {lectures.map((lecture) => (
              <LectureCard key={lecture.id} subjectId={subjectId} lecture={lecture} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            لا توجد محاضرات مرفوعة لهذه المادة حتى الآن. اضغط زر &ldquo;رفع محاضرة&rdquo; للبدء.
          </div>
        )}
      </TabsContent>

      {/* Tab 2: Smart Training (University Style Practice) */}
      <TabsContent value="smart-training" className="space-y-4">
        <Card className="border-border shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              توليد امتحان تدريبي مخصص بنمط الجامعة (University Style)
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              يحلل النظام صياغة أسئلة الامتحانات السابقة ويولد أسئلة جديدة موثقة ومربوطة بمصادر المنهج الرسمي.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label id="training-label-1" className="text-xs font-semibold text-foreground block mb-1.5">نمط توليد الأسئلة</label>
                <Select value={practiceType} onValueChange={(val) => {if(val==="PAST_EXAM"||val==="UNIVERSITY_STYLE"||val==="MIXED")setPracticeType(val); }}>
                  <SelectTrigger aria-labelledby="training-label-1" className="h-9 text-xs">
                    <SelectValue>{(value: keyof typeof practiceTypeLabels) => practiceTypeLabels[value]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNIVERSITY_STYLE">أسئلة جديدة بنمط امتحانات الجامعة (جديد كليًا)</SelectItem>
                    <SelectItem value="PAST_EXAM">أسئلة أصلية من الامتحانات السابقة المعتمدة</SelectItem>
                    <SelectItem value="MIXED">تدريب مختلط (امتحانات سابقة + نمط جامعي)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label id="training-label-2" className="text-xs font-semibold text-foreground block mb-1.5">طريقة الاختبار</label>
                <Select value={examMode} onValueChange={(val) => {if(val==="STUDY"||val==="EXAM")setExamMode(val); }}>
                  <SelectTrigger aria-labelledby="training-label-2" className="h-9 text-xs">
                    <SelectValue>{(value: keyof typeof examModeLabels) => examModeLabels[value]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STUDY">نمط الدراسة (عرض الشرح والمصدر فورًا بعد كل سؤال)</SelectItem>
                    <SelectItem value="EXAM">نمط الامتحان (حجب الإجابات حتى الانتهاء وحساب النتيجة)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label id="training-label-3" className="text-xs font-semibold text-foreground block mb-1.5">عدد الأسئلة</label>
                <Select value={questionCount} onValueChange={(val) => { if (val) setQuestionCount(val); }}>
                  <SelectTrigger aria-labelledby="training-label-3" className="h-9 text-xs">
                    <SelectValue>{(value: string) => value}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 أسئلة سريعة</SelectItem>
                    <SelectItem value="10">10 أسئلة (تدريب قياسي)</SelectItem>
                    <SelectItem value="15">15 سؤالًا</SelectItem>
                    <SelectItem value="20">20 سؤالًا (امتحان تجريبي كامل)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label id="training-label-4" className="text-xs font-semibold text-foreground block mb-1.5">مستوى الصعوبة</label>
                <Select value={difficulty} onValueChange={(val) => { if (val==="EASY"||val==="MEDIUM"||val==="HARD") setDifficulty(val); }}>
                  <SelectTrigger aria-labelledby="training-label-4" className="h-9 text-xs">
                    <SelectValue>{(value: keyof typeof practiceDifficultyLabels) => practiceDifficultyLabels[value]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EASY">سهل (تذكر ومفاهيم أساسية)</SelectItem>
                    <SelectItem value="MEDIUM">متوسط (تطبيق وتمريض سريري)</SelectItem>
                    <SelectItem value="HARD">متقدم (حالات سريرية وأولويات وتمييز معقد)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {repeatedTopics.length > 0 && (
              <div>
                <label id="training-label-5" className="text-xs font-semibold text-foreground block mb-1.5">تحديد موضوع معين (اختياري)</label>
                <Select value={selectedTopic} onValueChange={(val) => { if (val) setSelectedTopic(val); }}>
                  <SelectTrigger aria-labelledby="training-label-5" className="h-9 text-xs">
                    <SelectValue placeholder="كافة موضوعات المادة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كافة موضوعات المنهج</SelectItem>
                    {repeatedTopics.map((t) => (
                      <SelectItem key={t.topic} value={t.topic}>
                        {t.topic} (تكرر {t.frequencyPercentage}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-end border-t pt-3">
            <Button
              onClick={() => handleStartPractice()}
              disabled={loadingExam}
              className="w-full gap-2 sm:w-auto"
            >
              <Play className="size-4" />
              {loadingExam ? "جارٍ تجهيز الامتحان..." : "ابدأ التدريب الآن"}
            </Button>
          </CardFooter>
        </Card>
      </TabsContent>

      {/* Tab 3: Past Exams */}
      <TabsContent value="past-exams" className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">نماذج امتحانات السنوات السابقة</h3>
          <span className="text-xs text-muted-foreground">امتحانات حقيقية معتمدة ومحققة الإجابات</span>
        </div>

        {pastExams.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {pastExams.map((exam) => (
              <Card key={exam.id} className="border-border hover:border-primary/50 transition-colors shadow-xs">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[11px]">
                      {exam.exam_year ? `امتحان ${exam.exam_year}` : "امتحان سابق"}
                    </Badge>
                    <Badge variant="secondary" className="text-[11px]">{exam.exam_type}</Badge>
                  </div>
                  <CardTitle className="text-sm font-bold mt-2">{exam.title}</CardTitle>
                  {exam.doctor_name && (
                    <p className="text-xs text-muted-foreground">إعداد: د. {exam.doctor_name}</p>
                  )}
                </CardHeader>
                <CardContent className="p-4 pt-1 text-xs text-muted-foreground">
                  <span>{exam.verified_questions} سؤال معتمد وموثق</span>
                  {exam.semester && <span> • الفصل {exam.semester}</span>}
                </CardContent>
                <CardFooter className="p-4 pt-0 border-t flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => handleStartPractice("PAST_EXAM")}
                    disabled={loadingExam}
                    className="gap-1.5 text-xs h-8"
                  >
                    <Play className="size-3.5" />
                    ابدأ الامتحان
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            لا توجد نماذج امتحانات سابقة مرفوعة لهذه المادة حتى الآن.
          </div>
        )}
      </TabsContent>

      {/* Tab 4: Exam Insights & Smart Review */}
      <TabsContent value="exam-insights" className="space-y-4">
        {/* Smart Review Recommendations */}
        {smartReviewRecommendations.length > 0 && (
          <Card className="border-amber-500/20 bg-amber-500/5 shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                <Sparkles className="size-4 text-amber-600 dark:text-amber-400" />
                توصيات المراجعة الذكية (مبنية على تكرار الامتحانات وأدائك)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {smartReviewRecommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-card border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <span className="font-bold text-foreground block">{rec.topic}</span>
                    <p className="text-muted-foreground mt-0.5">{rec.recommendationMessage}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 h-8 text-xs border-amber-500/30 hover:bg-amber-50 dark:hover:bg-amber-950"
                    onClick={() => handleStartPractice("MIXED", rec.topic)}
                    disabled={loadingExam}
                  >
                    تدرب على هذا الموضوع
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Most Repeated Topics */}
        <Card className="border-border shadow-xs">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <BarChart3 className="size-4 text-primary" />
              أكثر المواضيع تكرارًا في الامتحانات السابقة
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              تحليل إحصائي دقيق بدون أي تخمين أو وعود غير مؤكدة.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {repeatedTopics.length > 0 ? (
              repeatedTopics.map((topic) => (
                <div key={topic.topic} className="p-3 rounded-xl border bg-card text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground text-sm">{topic.topic}</span>
                    <Badge variant="secondary" className="font-bold text-primary">
                      {topic.frequencyPercentage}% تكرار
                    </Badge>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary h-full rounded-full transition-all"
                      style={{ width: `${topic.frequencyPercentage}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">{topic.phrasingLabel}</p>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-6">
                سيظهر تحليل المواضيع المتكررة تلقائيًا بعد رفع وفهرسة نماذج امتحانات لهذه المادة.
              </p>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
