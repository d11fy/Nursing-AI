import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { ArrowRight, BookOpen, TrendingUp } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { getPool } from "@/lib/db/pool";
import { getSettings } from "@/lib/usage";
import { canStudentAccessSubject, getSubjectById } from "@/lib/subjects";
import { getSmartReviewRecommendations } from "@/lib/exams/practice-service";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SubjectTrainingTabs } from "@/components/dashboard/subject-training-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { getSubjectProgress } from "@/lib/learning-progress/service";

export default async function SubjectDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const subject = await getSubjectById(id);
  if (!subject) notFound();
  if (!await canStudentAccessSubject(profile.user_id, id)) forbidden();

  const db = await createClient();
  const pool = getPool();

  const [{ data: lectures }, settings, examsRes, statsRes, smartReview, learningProgress] = await Promise.all([
    db
      .from("lectures")
      .select("id, title, file_name, status, file_size_bytes, delete_after, deleted_at")
      .eq("subject_id", id)
      .order("created_at", { ascending: false }),
    getSettings(db),
    pool.query<{
      id: string;
      title: string;
      exam_year: number | null;
      semester: number | null;
      exam_type: string;
      doctor_name: string | null;
      total_questions: number;
      verified_questions: number;
    }>(
      `SELECT id, title, exam_year, semester, exam_type, doctor_name,
              total_questions, verified_questions
       FROM public.exams
       WHERE subject_id = $1 AND status = 'READY' AND verified_questions > 0
       ORDER BY exam_year DESC NULLS LAST, created_at DESC`,
      [id]
    ),
    pool.query<{
      topic: string;
      appeared_in_exams: number;
      total_exams: number;
      question_count: number;
      frequency: number;
      phrasing: string;
      avg_difficulty: number;
    }>(
      `SELECT topic, exam_count AS appeared_in_exams, total_exams, question_count,
              frequency, avg_difficulty,
              ('تكرر في ' || exam_count || ' من أصل ' || total_exams || ' نماذج امتحانات متاحة (' || frequency || '%).') AS phrasing
       FROM public.exam_topic_stats
       WHERE subject_id = $1
       ORDER BY frequency DESC, question_count DESC
       LIMIT 8`,
      [id]
    ),
    getSmartReviewRecommendations(profile.user_id, id),
    getSubjectProgress(profile.user_id, id),
  ]);

  const repeatedTopics = statsRes.rows.map((r) => ({
    topic: r.topic,
    appearedInExams: r.appeared_in_exams,
    totalExams: r.total_exams,
    questionCount: r.question_count,
    frequencyPercentage: Number(r.frequency),
    phrasingLabel: r.phrasing,
    commonQuestionTypes: [],
    averageDifficulty: Number(r.avg_difficulty),
  }));

  return (
    <div className="page-container mx-auto max-w-4xl space-y-6">
      <Link href="/dashboard/subjects" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" />
        العودة إلى المواد
      </Link>
      <PageHeader
        icon={BookOpen}
        eyebrow="مساحة المادة"
        title={subject.name_ar}
        description={<><span dir="ltr" className="block text-start">{subject.name_en}</span>{subject.description_ar && <span className="mt-2 block">{subject.description_ar}</span>}</>}
        actions={<Button nativeButton={false} render={<Link href={`/dashboard/chat?subject=${subject.id}`}>ابدأ محادثة للمادة</Link>} />}
      />
      <Card className="bg-muted/35">
        <CardContent className="space-y-3 pt-5">
          <p className="text-xs font-bold text-muted-foreground">السنوات الدراسية المتاحة</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {subject.academic_years.map(y => (
              <span key={y.id} className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground">{y.name_ar}</span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/15 bg-primary/3">
        <CardContent className="space-y-4 pt-1">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="flex items-center gap-2 font-extrabold"><TrendingUp className="size-4 text-primary" />تقدمك في المادة</p>
              <p className="mt-1 text-xs text-muted-foreground">{learningProgress.subject ? `${learningProgress.subject.topicsStudied} مواضيع دُرست · ${learningProgress.subject.questionsAnswered} أسئلة` : "ابدأ بحل Quiz حتى نقدر نقيس تقدمك."}</p></div>
            <Button nativeButton={false} variant="outline" className="w-full sm:w-auto" render={<Link href="/dashboard/progress">عرض التقدم</Link>} />
          </div>
          {learningProgress.subject?.masteryScore != null && <div className="space-y-2"><div className="flex justify-between text-sm"><span>الإتقان المقاس</span><strong>{learningProgress.subject.masteryScore}%</strong></div><Progress value={learningProgress.subject.masteryScore} /><p className="text-xs text-muted-foreground">{learningProgress.weakTopics.length} مواضيع تحتاج مراجعة · {learningProgress.mistakes} أخطاء حالية</p></div>}
        </CardContent>
      </Card>

      <SubjectTrainingTabs
        subjectId={id}
        subjectName={subject.name_ar}
        lectures={lectures || []}
        pastExams={examsRes.rows}
        repeatedTopics={repeatedTopics}
        smartReviewRecommendations={smartReview}
        lectureLargeFileMb={settings.lectureLargeFileMb}
        lectureMaxFileMb={settings.lectureMaxFileMb}
      />
    </div>
  );
}
