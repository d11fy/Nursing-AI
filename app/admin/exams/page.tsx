import { requireAdminProfile } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import { ExamsView } from "@/components/admin/exams-view";

export const metadata = {
  title: "نماذج الامتحانات السابقة | لوحة الإدارة",
  description: "إدارة ومراجعة نماذج امتحانات السنوات السابقة وبنوك الأسئلة المرفوعة",
};

export default async function AdminExamsPage() {
  await requireAdminProfile();
  const pool = getPool();

  const [examsRes, subjectsRes] = await Promise.all([
    pool.query<{
      id: string;
      subject_id: string;
      subject_name: string;
      title: string;
      exam_year: number | null;
      semester: number | null;
      exam_type: string;
      doctor_name: string | null;
      status: string;
      total_questions: number;
      verified_questions: number;
      needs_review_questions: number;
      conflict_questions: number;
      error_message: string | null;
      created_at: string;
    }>(
      `SELECT
         e.id, e.subject_id, s.name_ar AS subject_name,
         e.title, e.exam_year, e.semester, e.exam_type, e.doctor_name,
         e.status, e.total_questions, e.verified_questions,
         e.needs_review_questions, e.conflict_questions, e.error_message,
         e.created_at
       FROM public.exams e
       JOIN public.subjects s ON s.id = e.subject_id
       ORDER BY e.created_at DESC`
    ),
    pool.query<{ id: string; name_ar: string }>(
      `SELECT id, name_ar FROM public.subjects WHERE status = 'active' ORDER BY sort_order, name_ar`
    ),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          نماذج الامتحانات وبنوك الأسئلة (Past Exams & Question Banks)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          قائمة نماذج الامتحانات المرفوعة والمستخرجة، وحالات التحقق المصدري من كل سؤال.
        </p>
      </div>

      <ExamsView initialExams={examsRes.rows} subjects={subjectsRes.rows} />
    </div>
  );
}
