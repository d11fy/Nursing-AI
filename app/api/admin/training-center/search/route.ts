import { NextResponse } from "next/server";
import { getAdminProfileOrNull } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";

export async function GET(request: Request) {
  try {
    const admin = await getAdminProfileOrNull();
    if (!admin) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim();
    const subjectId = searchParams.get("subjectId");

    if (!query) {
      return NextResponse.json({
        bookSections: [],
        lectureSections: [],
        summaryPoints: [],
        pastExamQuestions: [],
        generatedQuestions: [],
      });
    }

    const pool = getPool();
    const cleanTerm = query
      .toLowerCase()
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/[ًٌٍَُِّْـ]/g, "")
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 1)
      .join(" | ");

    if (!cleanTerm) {
      return NextResponse.json({
        bookSections: [],
        lectureSections: [],
        summaryPoints: [],
        pastExamQuestions: [],
        generatedQuestions: [],
      });
    }

    const subFilter = subjectId ? `AND d.subject_id = $2` : "";
    const qSubFilter = subjectId ? `AND eq.subject_id = $2` : "";
    const smSubFilter = subjectId ? `AND sp.subject_id = $2` : "";
    const queryParams: unknown[] = [cleanTerm];
    if (subjectId) queryParams.push(subjectId);

    const [booksRes, lecturesRes, summariesRes, pastExamsRes, genQuestionsRes] =
      await Promise.all([
        // 1. Book Sections
        pool.query<{ id: string; title: string; page_number: number | null; content: string }>(
          `SELECT dc.id, d.title, dc.page_number, dc.content
           FROM public.document_chunks dc
           JOIN public.documents d ON d.id = dc.document_id
           WHERE d.status = 'ready'
             AND d.source_type IN ('BOOK', 'TEXTBOOK', 'book')
             AND dc.search_vector @@ to_tsquery('simple', $1)
             ${subFilter}
           ORDER BY ts_rank_cd(dc.search_vector, to_tsquery('simple', $1)) DESC
           LIMIT 5`,
          queryParams
        ),

        // 2. Lecture Sections
        pool.query<{ id: string; title: string; page_number: number | null; content: string }>(
          `SELECT dc.id, d.title, dc.page_number, dc.content
           FROM public.document_chunks dc
           JOIN public.documents d ON d.id = dc.document_id
           WHERE d.status = 'ready'
             AND d.source_type IN ('LECTURE', 'UNIVERSITY_LECTURE', 'DOCTOR_SLIDES', 'lecture')
             AND dc.search_vector @@ to_tsquery('simple', $1)
             ${subFilter}
           ORDER BY ts_rank_cd(dc.search_vector, to_tsquery('simple', $1)) DESC
           LIMIT 5`,
          queryParams
        ),

        // 3. Summary Points
        pool.query<{ id: string; topic: string; point_type: string; content: string; verification_status: string }>(
          `SELECT sp.id, sp.topic, sp.point_type, sp.content, sp.verification_status
           FROM public.summary_knowledge_points sp
           WHERE to_tsvector('simple', sp.content || ' ' || sp.topic) @@ to_tsquery('simple', $1)
             ${smSubFilter}
           LIMIT 6`,
          queryParams
        ),

        // 4. Past Exam Questions
        pool.query<{ id: string; question_text: string; topic: string; status: string; exam_year: number | null }>(
          `SELECT eq.id, eq.question_text, eq.topic, eq.status, e.exam_year
           FROM public.exam_questions eq
           JOIN public.exams e ON e.id = eq.exam_id
           WHERE to_tsvector('simple', eq.question_text || ' ' || eq.topic) @@ to_tsquery('simple', $1)
             ${qSubFilter}
           LIMIT 6`,
          queryParams
        ),

        // 5. Generated Practice Questions
        pool.query<{ id: string; question_text: string; topic: string; status: string }>(
          `SELECT eq.id, eq.question_text, eq.topic, eq.status
           FROM public.exam_questions eq
           WHERE eq.exam_id IS NULL
             AND to_tsvector('simple', eq.question_text || ' ' || eq.topic) @@ to_tsquery('simple', $1)
             ${qSubFilter}
           LIMIT 6`,
          queryParams
        ),
      ]);

    return NextResponse.json({
      bookSections: booksRes.rows,
      lectureSections: lecturesRes.rows,
      summaryPoints: summariesRes.rows,
      pastExamQuestions: pastExamsRes.rows,
      generatedQuestions: genQuestionsRes.rows,
    });
  } catch (err) {
    console.error("[SearchAcrossEverythingAPI] error:", err);
    return NextResponse.json({ error: "تعذر تنفيذ البحث الشامل" }, { status: 500 });
  }
}
