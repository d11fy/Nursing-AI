import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { canStudentAccessSubject } from "@/lib/subjects";
import { getPool } from "@/lib/db/pool";
import { getSmartReviewRecommendations } from "@/lib/exams/practice-service";

export async function GET(request: Request) {
  try {
    const profile = await requireProfile();
    const { searchParams } = new URL(request.url);
    const subjectId = searchParams.get("subjectId");

    if (!subjectId) {
      return NextResponse.json({ error: "المادة مطلوبة" }, { status: 400 });
    }

    const hasAccess = await canStudentAccessSubject(profile.user_id, subjectId);
    if (!hasAccess && profile.role !== "admin") {
      return NextResponse.json({ error: "غير مصرح لك بالوصول لهذه المادة" }, { status: 403 });
    }

    const pool = getPool();

    const [statsRes, qCountRes, examsRes, smartReview] = await Promise.all([
      // 1. Topic recurrence stats
      pool.query<{
        topic: string;
        exam_count: number;
        total_exams: number;
        question_count: number;
        frequency: number;
        avg_difficulty: number;
      }>(
        `SELECT topic, exam_count, total_exams, question_count, frequency, avg_difficulty
         FROM public.exam_topic_stats
         WHERE subject_id = $1
         ORDER BY frequency DESC, question_count DESC
         LIMIT 10`,
        [subjectId]
      ),

      // 2. Verified question count & total exams count
      pool.query<{
        total_verified: number;
        total_exams: number;
      }>(
        `SELECT
           (SELECT count(*)::int FROM public.exam_questions WHERE subject_id = $1 AND status = 'VERIFIED') AS total_verified,
           (SELECT count(*)::int FROM public.exams WHERE subject_id = $1 AND status = 'READY') AS total_exams`,
        [subjectId]
      ),

      // 3. Available past exams list for student selection
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
        [subjectId]
      ),

      // 4. Smart review recommendations for this student
      getSmartReviewRecommendations(profile.user_id, subjectId),
    ]);

    const counts = qCountRes.rows[0] ?? { total_verified: 0, total_exams: 0 };

    return NextResponse.json({
      totalExamsAnalyzed: counts.total_exams,
      totalVerifiedQuestions: counts.total_verified,
      repeatedTopics: statsRes.rows.map((r) => ({
        topic: r.topic,
        appearedInExams: r.exam_count,
        totalExams: r.total_exams,
        questionCount: r.question_count,
        frequency: Number(r.frequency),
        phrasing: `تكرر في ${r.exam_count} من أصل ${r.total_exams} نماذج امتحانات متاحة (${r.frequency}%).`,
      })),
      pastExams: examsRes.rows,
      smartReview,
    });
  } catch (err) {
    console.error("[PracticeAnalyticsAPI] GET error:", err);
    return NextResponse.json(
      { error: "تعذر جلب إحصائيات ونماذج الامتحانات" },
      { status: 500 }
    );
  }
}
