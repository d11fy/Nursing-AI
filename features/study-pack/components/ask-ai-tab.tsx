"use client";

import { ChatView } from "@/components/chat/chat-view";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AskAiTab({
  lectureId,
  subjectId,
  subjectName,
  maxImageSizeMb,
}: {
  lectureId: string;
  subjectId: string;
  subjectName: string;
  maxImageSizeMb: number;
}) {
  return (
    <div className="space-y-3">
      {/* Embedded Chat with Lecture Context */}
      <ChatView
        conversationId={null}
        initialMessages={[]}
        lectureId={lectureId}
        subjectId={subjectId}
        subjectName={subjectName}
        maxImageSizeMb={maxImageSizeMb}
        containerClassName="h-[calc(100vh-14rem)] min-h-[550px]"
      />
    </div>
  );
}
