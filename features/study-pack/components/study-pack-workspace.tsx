"use client";

import { useState } from "react";
import {
  BookOpen,
  FileText,
  Sparkles,
  Layers,
  HelpCircle,
  MessageSquare,
  TriangleAlert,
  Calendar,
  HardDrive,
  CheckCircle2,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { daysUntil } from "@/lib/lectures/retention-display";
import { StudyTab } from "./study-tab";
import { SummaryTab } from "./summary-tab";
import { KeyPointsTab } from "./key-points-tab";
import { FlashcardsTab } from "./flashcards-tab";
import { QuizTab } from "./quiz-tab";
import { AskAiTab } from "./ask-ai-tab";
import type { StudyPackWorkspaceData } from "../types";

function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StudyPackWorkspace({
  data,
  maxImageSizeMb,
}: {
  data: StudyPackWorkspaceData;
  maxImageSizeMb: number;
}) {
  const [activeTab, setActiveTab] = useState("study");
  const { studyPack, lecture, subject, pages, summaryStatus, keyPointsStatus, flashcardsCount, quizzesCount } = data;

  const daysLeft = lecture.deleteAfter ? daysUntil(lecture.deleteAfter) : null;

  return (
    <div className="space-y-6">
      {/* Workspace Header */}
      <div className="space-y-3">
        <PageHeader
          icon={BookOpen}
          eyebrow={`Study Pack · ${subject.nameAr}`}
          title={lecture.title}
          description={
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
              <span className="font-semibold text-foreground" dir="ltr">
                {subject.nameEn}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <HardDrive className="size-3.5" />
                {formatSize(lecture.fileSizeBytes)}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Calendar className="size-3.5" />
                {new Date(lecture.uploadedAt).toLocaleDateString("ar-EG")}
              </span>
            </div>
          }
        />

        {/* Large File Retention Notice if applicable */}
        {daysLeft !== null && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <TriangleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              <strong>تنبيه الاحتفاظ:</strong> سيتم حذف الملف الأصلي بعد {daysLeft} {daysLeft === 1 ? "يوم" : "أيام"} لتقليل استهلاك المساحة، بينما ستبقى حزمة الدراسة (Study Pack) والمحتوى المستخرج متاحين لك دائمًا.
            </span>
          </div>
        )}

        {/* Study Pack Progress Indicator Summary */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge
            variant="outline"
            className={`gap-1 ${summaryStatus === "ready" ? "border-green-500/30 text-green-700 dark:text-green-300 bg-green-50/50 dark:bg-green-950/50" : "text-muted-foreground"}`}
          >
            <FileText className="size-3" />
            {summaryStatus === "ready" ? "الملخص جاهز" : "الملخص لم ينشأ"}
          </Badge>

          <Badge
            variant="outline"
            className={`gap-1 ${keyPointsStatus === "ready" ? "border-amber-500/30 text-amber-700 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-950/50" : "text-muted-foreground"}`}
          >
            <Sparkles className="size-3" />
            {keyPointsStatus === "ready" ? "النقاط جاهزة" : "النقاط لم تنشأ"}
          </Badge>

          <Badge
            variant="outline"
            className={`gap-1 ${flashcardsCount > 0 ? "border-purple-500/30 text-purple-700 dark:text-purple-300 bg-purple-50/50 dark:bg-purple-950/50" : "text-muted-foreground"}`}
          >
            <Layers className="size-3" />
            {flashcardsCount > 0 ? `${flashcardsCount} بطاقة` : "لا بطاقات"}
          </Badge>

          <Badge
            variant="outline"
            className={`gap-1 ${quizzesCount > 0 ? "border-blue-500/30 text-blue-700 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-950/50" : "text-muted-foreground"}`}
          >
            <HelpCircle className="size-3" />
            {quizzesCount > 0 ? "اختبار متوفر" : "لا اختبار"}
          </Badge>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(String(val))} className="gap-4">
        {/* Responsive Horizontal Scroll Tabs List */}
        <TabsList className="h-auto w-full justify-start overflow-x-auto border border-border bg-muted/60 p-1 flex-nowrap scrollbar-none [&_[data-slot=tabs-trigger]]:min-h-10 [&_[data-slot=tabs-trigger]]:shrink-0">
          <TabsTrigger value="study" className="text-xs sm:text-sm font-semibold gap-1.5">
            <BookOpen className="size-3.5 text-primary" />
            الدراسة والمحتوى
          </TabsTrigger>
          <TabsTrigger value="summary" className="text-xs sm:text-sm font-semibold gap-1.5">
            <FileText className="size-3.5 text-blue-500" />
            الملخص
          </TabsTrigger>
          <TabsTrigger value="key_points" className="text-xs sm:text-sm font-semibold gap-1.5">
            <Sparkles className="size-3.5 text-amber-500" />
            أهم النقاط
          </TabsTrigger>
          <TabsTrigger value="flashcards" className="text-xs sm:text-sm font-semibold gap-1.5">
            <Layers className="size-3.5 text-purple-500" />
            البطاقات ({flashcardsCount})
          </TabsTrigger>
          <TabsTrigger value="quiz" className="text-xs sm:text-sm font-semibold gap-1.5">
            <HelpCircle className="size-3.5 text-green-500" />
            الاختبار الذاتي
          </TabsTrigger>
          <TabsTrigger value="ask" className="text-xs sm:text-sm font-semibold gap-1.5">
            <MessageSquare className="size-3.5 text-primary" />
            اسأل AI
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Study */}
        <TabsContent value="study" className="pt-3">
          <StudyTab
            pages={pages}
            lectureTitle={lecture.title}
            subjectName={subject.nameAr}
            onNavigateTab={setActiveTab}
          />
        </TabsContent>

        {/* Tab 2: Summary */}
        <TabsContent value="summary" className="pt-3">
          <SummaryTab
            studyPackId={studyPack.id}
            initialContent={data.initialSummary}
            initialStatus={summaryStatus}
          />
        </TabsContent>

        {/* Tab 3: Key Points */}
        <TabsContent value="key_points" className="pt-3">
          <KeyPointsTab
            studyPackId={studyPack.id}
            initialContent={data.initialKeyPoints}
            initialStatus={keyPointsStatus}
          />
        </TabsContent>

        {/* Tab 4: Flashcards */}
        <TabsContent value="flashcards" className="pt-3">
          <FlashcardsTab studyPackId={studyPack.id} />
        </TabsContent>

        {/* Tab 5: Quiz */}
        <TabsContent value="quiz" className="pt-3">
          <QuizTab studyPackId={studyPack.id} />
        </TabsContent>

        {/* Tab 6: Ask AI */}
        <TabsContent value="ask" className="pt-3">
          <AskAiTab
            lectureId={data.sourceKind === "lecture" ? lecture.id : null}
            subjectId={subject.id}
            subjectName={subject.nameAr}
            maxImageSizeMb={maxImageSizeMb}
            librarySource={data.sourceKind === "library" ? {
              id: lecture.id,
              title: lecture.title,
              category: "university_lecture",
              subjectId: subject.id,
              subjectName: subject.nameAr,
              sourceLabel: null,
            } : undefined}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
