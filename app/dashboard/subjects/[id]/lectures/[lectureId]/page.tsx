import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, FileText } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { getSettings } from "@/lib/usage";
import { getStudyContent } from "@/lib/lectures/study-content";
import { LectureStatusBanner } from "@/components/dashboard/lecture-status-banner";
import { LectureWorkspaceTabs } from "@/components/dashboard/lecture-workspace-tabs";

function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function LectureWorkspacePage({
  params,
}: {
  params: Promise<{ id: string; lectureId: string }>;
}) {
  const { id: subjectId, lectureId } = await params;
  const profile=await requireProfile();
  const db = await createClient();

  const { data: lecture } = await db
    .from("lectures")
    .select("id, title, mime_type, file_size_bytes, status, error_message, uploaded_at")
    .eq("id", lectureId)
    .single();
  if (!lecture) notFound();

  const [settings, initialContent] = await Promise.all([
    getSettings(db),
    lecture.status === "ready" ? getStudyContent(lectureId,profile.user_id) : Promise.resolve({}),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <Link href={`/dashboard/subjects/${subjectId}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" />العودة إلى المادة
      </Link>

      <div className="flex items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950">
          <FileText />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">{lecture.title}</h1>
          <p className="text-sm text-muted-foreground">
            {formatSize(lecture.file_size_bytes)} · {new Date(lecture.uploaded_at).toLocaleDateString("ar-EG")}
          </p>
        </div>
      </div>

      {lecture.status !== "ready" ? (
        <LectureStatusBanner lectureId={lecture.id} status={lecture.status} errorMessage={lecture.error_message} />
      ) : (
        <LectureWorkspaceTabs lectureId={lecture.id} initialContent={initialContent} maxImageSizeMb={settings.maxImageSizeMb} />
      )}
    </div>
  );
}
