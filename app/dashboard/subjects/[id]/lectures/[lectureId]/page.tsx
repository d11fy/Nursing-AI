import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { getSettings } from "@/lib/usage";
import { canStudentAccessSubject } from "@/lib/subjects";
import { getStudyPackWorkspace } from "@/features/study-pack/services/study-pack-service";
import { StudyPackWorkspace } from "@/features/study-pack/components/study-pack-workspace";
import { LectureStatusBanner } from "@/components/dashboard/lecture-status-banner";

export default async function LectureWorkspacePage({
  params,
}: {
  params: Promise<{ id: string; lectureId: string }>;
}) {
  const { id: subjectId, lectureId } = await params;
  const profile = await requireProfile();

  if (!(await canStudentAccessSubject(profile.user_id, subjectId))) {
    notFound();
  }

  const db = await createClient();

  const { data: lecture } = await db
    .from("lectures")
    .select("id, title, mime_type, file_size_bytes, status, error_message, uploaded_at, user_id")
    .eq("id", lectureId)
    .single();

  if (!lecture || lecture.user_id !== profile.user_id) {
    notFound();
  }

  const settings = await getSettings(db);

  if (lecture.status !== "ready" && lecture.status !== "expired") {
    return (
      <div className="page-container mx-auto max-w-4xl space-y-6">
        <Link
          href={`/dashboard/subjects/${subjectId}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-4" />
          العودة إلى المادة
        </Link>
        <LectureStatusBanner
          lectureId={lecture.id}
          status={lecture.status}
          errorMessage={lecture.error_message}
        />
      </div>
    );
  }

  const workspaceData = await getStudyPackWorkspace(lectureId, profile.user_id);

  return (
    <div className="page-container mx-auto max-w-4xl space-y-6">
      <Link
        href={`/dashboard/subjects/${subjectId}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-4" />
        العودة إلى المادة
      </Link>

      <StudyPackWorkspace
        data={workspaceData}
        maxImageSizeMb={settings.maxImageSizeMb}
      />
    </div>
  );
}
