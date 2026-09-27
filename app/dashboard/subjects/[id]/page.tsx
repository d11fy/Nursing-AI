import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { ArrowRight, BookOpen } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { getSettings } from "@/lib/usage";
import { canStudentAccessSubject, getSubjectById } from "@/lib/subjects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LectureUploadDialog } from "@/components/dashboard/lecture-upload-dialog";
import { LectureCard } from "@/components/dashboard/lecture-card";

export default async function SubjectDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const subject = await getSubjectById(id);
  if (!subject) notFound();
  if (!await canStudentAccessSubject(profile.user_id, id)) forbidden();

  const db = await createClient();
  const [{ data: lectures }, settings] = await Promise.all([
    db
      .from("lectures")
      .select("id, title, file_name, status, file_size_bytes, delete_after, deleted_at")
      .eq("subject_id", id)
      .order("created_at", { ascending: false }),
    getSettings(db),
  ]);

  return <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
    <Link href="/dashboard/subjects" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" />العودة إلى المواد</Link>
    <Card><CardHeader><div className="flex size-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950"><BookOpen /></div><CardTitle>{subject.name_ar}</CardTitle><p dir="ltr" className="text-sm text-muted-foreground">{subject.name_en}</p></CardHeader><CardContent className="space-y-5">
      {subject.description_ar && <p className="leading-7 text-muted-foreground">{subject.description_ar}</p>}
      <div className="flex flex-wrap gap-2 text-sm">{subject.academic_years.map(y => <span key={y.id} className="rounded-full bg-muted px-3 py-1">{y.name_ar}</span>)}</div>
      <Button nativeButton={false} render={<Link href={`/dashboard/chat?subject=${subject.id}`}>ابدأ محادثة</Link>} />
    </CardContent></Card>

    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">محاضراتي</h2>
        <LectureUploadDialog subjectId={id} largeFileMb={settings.lectureLargeFileMb} maxFileMb={settings.lectureMaxFileMb} />
      </div>
      {lectures && lectures.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {lectures.map((lecture) => <LectureCard key={lecture.id} subjectId={id} lecture={lecture} />)}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          لا توجد محاضرات بعد. ابدأ برفع أول محاضرة لهذه المادة.
        </p>
      )}
    </div>
  </div>;
}
