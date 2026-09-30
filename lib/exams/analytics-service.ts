import "server-only";
import { getPool } from "@/lib/db/pool";
import type { SubjectReadinessStatus } from "@/types/database";

export interface TopicRecurrenceStat {
  topic: string;
  appearedInExams: number;
  totalExams: number;
  questionCount: number;
  frequencyPercentage: number;
  phrasingLabel: string;
  commonQuestionTypes: string[];
  averageDifficulty: number;
}

export interface SubjectReadinessMetrics {
  subjectId: string;
  subjectName: string;
  readinessStatus: SubjectReadinessStatus;
  readinessPercentage: number;
  totalDocuments: number;
  officialBooksCount: number;
  lecturesCount: number;
  summariesCount: number;
  pastExamsCount: number;
  totalQuestions: number;
  verifiedQuestions: number;
  needsReviewQuestions: number;
  conflictQuestions: number;
  retrievalSuccessRate: number | null;
  verifiedRatio: number;
  topRepeatedTopics: TopicRecurrenceStat[];
}

/**
 * Re-computes and syncs exam pattern analytics for a given subject.
 * Runs in background after exam upload/verification or on demand.
 */
export async function syncExamTopicStats(subjectId: string): Promise<TopicRecurrenceStat[]> {
  const pool = getPool();

  // 1. Count total distinct exams available for this subject
  const { rows: examCountRows } = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM public.exams WHERE subject_id = $1 AND status = 'READY'`,
    [subjectId]
  );
  const totalExams = examCountRows[0]?.count ?? 0;

  // 2. Aggregate topics from exam_questions
  const { rows: topicRows } = await pool.query<{
    topic: string;
    appeared_in_exams: number;
    question_count: number;
    avg_difficulty: string;
    types: string[];
  }>(
    `SELECT
       eq.topic,
       count(distinct eq.exam_id)::int AS appeared_in_exams,
       count(eq.id)::int AS question_count,
       coalesce(avg(eq.difficulty_estimate), 0.5)::text AS avg_difficulty,
       array_agg(distinct eq.question_type) AS types
      FROM public.exam_questions eq
      JOIN public.exams e ON e.id=eq.exam_id AND e.status='READY'
      WHERE eq.subject_id = $1
        AND eq.status = 'VERIFIED'
     GROUP BY eq.topic
     ORDER BY question_count DESC`,
    [subjectId]
  );

  const results: TopicRecurrenceStat[] = [];

  for (const t of topicRows) {
    const frequency = totalExams > 0 ? Math.round((t.appeared_in_exams / totalExams) * 100) : 0;
    const phrasing = `تكرر هذا الموضوع في ${t.appeared_in_exams} من أصل ${totalExams} نماذج امتحانات متاحة (${frequency}%).`;

    results.push({
      topic: t.topic,
      appearedInExams: t.appeared_in_exams,
      totalExams,
      questionCount: t.question_count,
      frequencyPercentage: frequency,
      phrasingLabel: phrasing,
      commonQuestionTypes: t.types || [],
      averageDifficulty: parseFloat(t.avg_difficulty) || 0.5,
    });

    // Upsert into exam_topic_stats
    await pool.query(
      `INSERT INTO public.exam_topic_stats (
         subject_id, topic, exam_count, total_exams, question_count,
         frequency, common_question_types_json, avg_difficulty, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, now())
       ON CONFLICT (subject_id, topic) DO UPDATE SET
         exam_count = EXCLUDED.exam_count,
         total_exams = EXCLUDED.total_exams,
         question_count = EXCLUDED.question_count,
         frequency = EXCLUDED.frequency,
         common_question_types_json = EXCLUDED.common_question_types_json,
         avg_difficulty = EXCLUDED.avg_difficulty,
         updated_at = now()`,
      [
        subjectId,
        t.topic,
        t.appeared_in_exams,
        totalExams,
        t.question_count,
        frequency,
        JSON.stringify(t.types || []),
        parseFloat(t.avg_difficulty) || 0.5,
      ]
    );
  }

  await pool.query(
    `DELETE FROM public.exam_topic_stats WHERE subject_id=$1 AND NOT (topic=ANY($2::text[]))`,
    [subjectId, results.map((result) => result.topic)]
  );

  return results;
}

/**
 * Calculates operational source/question readiness. Evidence coverage is not answer accuracy.
 */
export async function calculateSubjectReadiness(subjectId: string): Promise<SubjectReadinessMetrics> {
  const pool = getPool();

  const [
    subjectInfo,
    docCounts,
    questionCounts,
    retrievalTrace,
    topicStats,
  ] = await Promise.all([
    pool.query<{ id: string; name_ar: string }>(
      `SELECT id, name_ar FROM public.subjects WHERE id = $1`,
      [subjectId]
    ),
    pool.query<{ source_type: string; count: number }>(
      `SELECT source_type, count(*)::int AS count
       FROM public.documents
       WHERE subject_id = $1 AND status = 'ready'
       GROUP BY source_type`,
      [subjectId]
    ),
    pool.query<{
      total: number;
      verified: number;
      needs_review: number;
      conflict: number;
    }>(
      `SELECT
         count(*)::int AS total,
         count(*) filter (where status = 'VERIFIED')::int AS verified,
         count(*) filter (where status = 'NEEDS_REVIEW')::int AS needs_review,
         count(*) filter (where status = 'CONFLICT')::int AS conflict
       FROM public.exam_questions
       WHERE subject_id = $1`,
      [subjectId]
    ),
    pool.query<{ total: number; supported: number }>(
      `SELECT
         count(*)::int AS total,
         count(*) filter (where t.evidence_coverage <> 'UNSUPPORTED')::int AS supported
       FROM public.message_ai_traces t
       JOIN public.conversations c ON c.id = t.conversation_id
       WHERE c.subject_id = $1`,
      [subjectId]
    ),
    pool.query<{
      topic: string;
      exam_count: number;
      total_exams: number;
      question_count: number;
      frequency: number;
      common_question_types_json: string[];
      avg_difficulty: number;
    }>(
      `SELECT topic, exam_count, total_exams, question_count, frequency,
              common_question_types_json, avg_difficulty
       FROM public.exam_topic_stats
       WHERE subject_id = $1
       ORDER BY frequency DESC, question_count DESC
       LIMIT 6`,
      [subjectId]
    ),
  ]);

  const subject = subjectInfo.rows[0];
  const qCounts = questionCounts.rows[0] ?? { total: 0, verified: 0, needs_review: 0, conflict: 0 };
  const rTrace = retrievalTrace.rows[0] ?? { total: 0, supported: 0 };

  // Breakdown of documents
  let totalDocs = 0;
  let books = 0;
  let lectures = 0;
  let summaries = 0;
  let pastExams = 0;

  for (const row of docCounts.rows) {
    const cnt = row.count;
    totalDocs += cnt;
    const st = (row.source_type || "").toUpperCase();
    if (st === "BOOK" || st === "TEXTBOOK") books += cnt;
    else if (st === "LECTURE" || st === "DOCTOR_SLIDES" || st === "UNIVERSITY_LECTURE") lectures += cnt;
    else if (st === "SUMMARY" || st === "REVIEW_NOTES") summaries += cnt;
    else if (st === "PAST_EXAM" || st === "QUESTION_BANK" || st === "QUESTIONS") pastExams += cnt;
  }

  // Purely deterministic readiness calculation
  // 1. Curriculum Documents Base: up to 35% (at least 1 book + 2 lectures gives full score)
  const curriculumDocsScore = Math.min(35, books * 15 + lectures * 10);

  // 2. Verified Questions Ratio: up to 35%
  const verifiedRatio = qCounts.total > 0 ? qCounts.verified / qCounts.total : 0;
  const verifiedQuestionsScore = Math.round(verifiedRatio * 35);

  // 3. Retrieval Success Rate: up to 20%
  const retrievalSuccessRate = rTrace.total > 0 ? Math.round((rTrace.supported / rTrace.total) * 100) : null;
  const retrievalScore = retrievalSuccessRate === null ? 0 : Math.round((retrievalSuccessRate / 100) * 20);

  // 4. Low Conflict / Review Penalty: up to 10%
  const conflictRatio = qCounts.total > 0 ? (qCounts.needs_review + qCounts.conflict) / qCounts.total : 0;
  const qualityScore = Math.max(0, Math.round(10 * (1 - conflictRatio)));

  const readinessPercentage = Math.min(100, Math.max(0, curriculumDocsScore + verifiedQuestionsScore + retrievalScore + qualityScore));

  let readinessStatus: SubjectReadinessStatus = "NOT_READY";
  if (totalDocs === 0) {
    readinessStatus = "NOT_READY";
  } else if (qCounts.conflict > 5 || qCounts.needs_review > qCounts.verified) {
    readinessStatus = "NEEDS_REVIEW";
  } else if (readinessPercentage >= 70 && books >= 1 && (lectures >= 1 || pastExams >= 1)) {
    readinessStatus = "READY";
  } else {
    readinessStatus = "BUILDING";
  }

  const topRepeatedTopics: TopicRecurrenceStat[] = topicStats.rows.map((t) => ({
    topic: t.topic,
    appearedInExams: t.exam_count,
    totalExams: t.total_exams,
    questionCount: t.question_count,
    frequencyPercentage: Number(t.frequency),
    phrasingLabel: `يظهر هذا الموضوع في ${t.exam_count} من أصل ${t.total_exams} نماذج امتحانات متاحة.`,
    commonQuestionTypes: Array.isArray(t.common_question_types_json) ? t.common_question_types_json : [],
    averageDifficulty: Number(t.avg_difficulty),
  }));

  return {
    subjectId,
    subjectName: subject?.name_ar ?? "المادة",
    readinessStatus,
    readinessPercentage,
    totalDocuments: totalDocs,
    officialBooksCount: books,
    lecturesCount: lectures,
    summariesCount: summaries,
    pastExamsCount: pastExams,
    totalQuestions: qCounts.total,
    verifiedQuestions: qCounts.verified,
    needsReviewQuestions: qCounts.needs_review,
    conflictQuestions: qCounts.conflict,
    retrievalSuccessRate,
    verifiedRatio: Math.round(verifiedRatio * 100),
    topRepeatedTopics,
  };
}
