"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChatView } from "@/components/chat/chat-view";
import { StudyContentPanel } from "@/components/dashboard/study-content-panel";
import type { StudyContentType } from "@/types/database";

export function LectureWorkspaceTabs({
  lectureId,
  subjectId,
  initialContent,
  maxImageSizeMb,
}: {
  lectureId: string;
  subjectId: string;
  initialContent: Partial<Record<StudyContentType, unknown>>;
  maxImageSizeMb: number;
}) {
  const [tab, setTab] = useState("summary");

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="gap-4">
      <TabsList className="h-auto max-w-full justify-start overflow-x-auto border border-border bg-muted/60 p-1 [&_[data-slot=tabs-trigger]]:min-h-11">
        <TabsTrigger value="summary">الملخص</TabsTrigger>
        <TabsTrigger value="key_points">أهم النقاط</TabsTrigger>
        <TabsTrigger value="ask">اسأل AI</TabsTrigger>
        <TabsTrigger value="quiz">Quiz</TabsTrigger>
        <TabsTrigger value="flashcards">Flashcards</TabsTrigger>
      </TabsList>

      <TabsContent value="summary" className="pt-4">
        <StudyContentPanel lectureId={lectureId} type="summary" initialContent={initialContent.summary} />
      </TabsContent>
      <TabsContent value="key_points" className="pt-4">
        <StudyContentPanel lectureId={lectureId} type="key_points" initialContent={initialContent.key_points} />
      </TabsContent>
      <TabsContent value="ask" className="pt-4">
        <ChatView
          conversationId={null}
          initialMessages={[]}
          lectureId={lectureId}
          subjectId={subjectId}
          maxImageSizeMb={maxImageSizeMb}
          containerClassName="h-[70vh]"
        />
      </TabsContent>
      <TabsContent value="quiz" className="pt-4">
        <StudyContentPanel lectureId={lectureId} type="quiz" initialContent={initialContent.quiz} />
      </TabsContent>
      <TabsContent value="flashcards" className="pt-4">
        <StudyContentPanel lectureId={lectureId} type="flashcards" initialContent={initialContent.flashcards} />
      </TabsContent>
    </Tabs>
  );
}
