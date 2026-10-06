"use client";

import { ChatView } from "@/components/chat/chat-view";
import type { ActiveLibrarySource } from "@/lib/library-types";

export function AskAiTab({
  lectureId,
  subjectId,
  subjectName,
  maxImageSizeMb,
  librarySource,
}: {
  lectureId?: string | null;
  subjectId: string;
  subjectName: string;
  maxImageSizeMb: number;
  librarySource?: ActiveLibrarySource;
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
        initialActiveSources={librarySource ? [librarySource] : []}
        containerClassName="h-[calc(100dvh-14rem)] min-h-[28rem]"
      />
    </div>
  );
}
