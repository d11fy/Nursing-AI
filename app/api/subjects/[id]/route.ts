import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getPool } from "@/lib/db/pool";
import { getSettings } from "@/lib/usage";
import { canStudentAccessSubject, getSubjectById } from "@/lib/subjects";
import { getSmartReviewRecommendations } from "@/lib/exams/practice-service";
import { getSubjectProgress } from "@/lib/learning-progress/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await createClient();
    const user = db.actor;
    if (!user || user.status !== "active") {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
    }

    const subject = await getSubjectById(id);
    if (!subject) {
      return NextResponse.json({ error: "المادة غير موجودة" }, { status: 404 });
    }

    if (!(await canStudentAccessSubject(user.user_id, id))) {
      return NextResponse.json({ error: "غير مصرح لك بالوصول لهذه المادة" }, { status: 403 });
    }

    const pool = getPool();
    const [{ data: lectures }, settings, examsRes, statsRes, smartReview, learningProgress] =
      await Promise.all([
        db
          .from("lectures")
          .select("id, title, file_name, status, file_size_bytes, delete_after, deleted_at, created_at")
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
        getSmartReviewRecommendations(user.user_id, id),
        getSubjectProgress(user.user_id, id),
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

    return NextResponse.json({
      subject,
      lectures: lectures || [],
      pastExams: examsRes.rows,
      repeatedTopics,
      smartReviewRecommendations: smartReview,
      learningProgress,
      settings: {
        lectureLargeFileMb: settings.lectureLargeFileMb,
        lectureMaxFileMb: settings.lectureMaxFileMb,
        maxImageSizeMb: settings.maxImageSizeMb,
      },
    });
  } catch (error) {
    console.error("GET /api/subjects/[id] error:", error);
    return NextResponse.json({ error: "تعذر تحميل تفاصيل المادة" }, { status: 500 });
  }
}
