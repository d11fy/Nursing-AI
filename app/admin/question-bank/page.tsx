import { requireAdminProfile } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import { QuestionBankView, type QuestionBankItem } from "@/components/admin/question-bank-view";

export const metadata = {
  title: "بنك الأسئلة المعتمد | لوحة الإدارة",
  description: "مراجعة واعتماد وتدقيق أسئلة الامتحانات وبنوك الأسئلة المربوطة بالمصادر المعتمدة",
};

export default async function AdminQuestionBankPage({
  searchParams,
}: {
  searchParams: Promise<{ subjectId?: string; status?: string; type?: string }>;
}) {
  await requireAdminProfile();
  const pool = getPool();
  const params = await searchParams;

  const [subjectsRes, questionsRes] = await Promise.all([
    pool.query<{ id: string; name_ar: string }>(
      `SELECT id, name_ar FROM public.subjects WHERE status = 'active' ORDER BY sort_order, name_ar`
    ),
    pool.query<QuestionBankItem>(
      `SELECT
         eq.id, eq.subject_id, s.name_ar AS subject_name,
         e.title AS exam_title, e.exam_year,
         eq.question_text, eq.question_type, eq.options_json,
         eq.correct_answer_json, eq.extracted_answer, eq.explanation,
         eq.topic, eq.subtopic, eq.difficulty, eq.status,
         eq.confidence, eq.page_number, eq.question_number,
         eq.review_notes,
         coalesce(
           (
             SELECT json_agg(
               json_build_object(
                 'id', qs.id,
                 'documentId', qs.document_id,
                 'documentTitle', d.title,
                 'pageNumber', qs.page_number,
                 'quote', qs.quote,
                 'supportType', qs.support_type,
                 'sourcePriority', qs.source_priority
               )
             )
             FROM public.question_sources qs
             JOIN public.documents d ON d.id = qs.document_id
             WHERE qs.question_id = eq.id
           ),
           '[]'::json
         ) AS sources
       FROM public.exam_questions eq
       JOIN public.subjects s ON s.id = eq.subject_id
       LEFT JOIN public.exams e ON e.id = eq.exam_id
       ${params.subjectId ? `WHERE eq.subject_id = '${params.subjectId}'` : ""}
       ORDER BY eq.created_at DESC
       LIMIT 60`
    ),
  ]);

  return (
    <div className="page-container mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          بنك الأسئلة ومراجعة التحقق المصدري (Question Bank & Verification)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          مراجعة كل سؤال مستخرج، فحص الأدلة والشواهد المسترجعة من كتب ومحاضرات المساق، واعتماد أو تعديل الإجابات.
        </p>
      </div>

      <QuestionBankView
        initialQuestions={questionsRes.rows}
        subjects={subjectsRes.rows}
        totalCount={questionsRes.rows.length}
      />
    </div>
  );
}
