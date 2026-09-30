import "server-only";
import { z } from "zod";
import { getPool } from "@/lib/db/pool";
import { routeAIRequest, getProviderByName } from "@/lib/ai/router";
import { executeWithFallback } from "@/lib/ai/fallback";
import { extractJson } from "@/lib/ai/json";
import { validQuestionEvidence, verifyExamQuestion } from "./question-verifier";
import { gradePracticeAnswer } from "./answer-grading";
import { searchTerms } from "@/lib/ai/curriculum-search";
import type { QuestionType } from "@/types/database";

export interface GeneratePracticeExamOptions {
  userId: string;
  subjectId: string;
  topic?: string;
  questionCount?: number;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
  practiceType: "PAST_EXAM" | "UNIVERSITY_STYLE" | "MIXED";
  mode: "STUDY" | "EXAM";
}

export interface PracticeQuestionView {
  id: string;
  questionText: string;
  questionType: QuestionType;
  options: string[];
  correctAnswer?: unknown;
  explanation?: string;
  topic: string;
  difficulty: string;
  pageNumber?: number | null;
  sourceLabel?: string;
  isPastExam: boolean;
  examYear?: number | null;
  sources: Array<{
    documentId: string;
    documentTitle: string;
    pageNumber: number | null;
    quote?: string | null;
    supportType: string;
  }>;
}

const generatedQuestionSchema = z.object({
  questions: z.array(
    z.object({
      question_text: z.string().min(10),
      question_type: z.enum([
        "MCQ",
        "TRUE_FALSE",
        "SHORT_ANSWER",
        "SATA",
        "PRIORITY",
        "CALCULATION",
        "CASE_STUDY",
      ]),
      options: z.array(z.string()).min(2),
      correct_answer: z.string(),
      explanation: z.string().min(5),
      topic: z.string(),
      difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
      source_chunk_index: z.number().int().min(0),
      evidence_quote: z.string().min(8),
    })
  ),
});

/**
 * Creates or retrieves a practice exam session.
 */
export async function createPracticeExam(
  options: GeneratePracticeExamOptions
): Promise<{
  attemptId: string;
  mode: "STUDY" | "EXAM";
  practiceType: string;
  questions: PracticeQuestionView[];
}> {
  const pool = getPool();
  const count = Math.min(30, Math.max(3, options.questionCount || 10));

  const selectedQuestions: PracticeQuestionView[] = [];

  // 1. Fetch from Past Exams if requested
  if (options.practiceType === "PAST_EXAM" || options.practiceType === "MIXED") {
    const pastExamLimit = options.practiceType === "MIXED" ? Math.ceil(count / 2) : count;

    let query = `
      SELECT
        eq.id, eq.question_text, eq.question_type, eq.options_json,
        eq.correct_answer_json, eq.extracted_answer, eq.explanation,
        eq.topic, eq.difficulty, eq.page_number, e.exam_year
      FROM public.exam_questions eq
      LEFT JOIN public.exams e ON e.id = eq.exam_id
      WHERE eq.subject_id = $1
        AND eq.status = 'VERIFIED'
        AND eq.correct_answer_json IS NOT NULL
    `;
    const params: unknown[] = [options.subjectId];

    if (options.topic) {
      params.push(options.topic);
      query += ` AND eq.topic = $${params.length}`;
    }

    query += ` ORDER BY random() LIMIT $${params.length + 1}`;
    params.push(pastExamLimit);

    const { rows } = await pool.query<{
      id: string;
      question_text: string;
      question_type: QuestionType;
      options_json: unknown;
      correct_answer_json: unknown;
      extracted_answer: string | null;
      explanation: string | null;
      topic: string;
      difficulty: string;
      page_number: number | null;
      exam_year: number | null;
    }>(query, params);

    for (const r of rows) {
      // Fetch cited sources
      const { rows: srcRows } = await pool.query<{
        document_id: string;
        title: string;
        page_number: number | null;
        quote: string | null;
        support_type: string;
      }>(
        `SELECT qs.document_id, d.title, qs.page_number, qs.quote, qs.support_type
         FROM public.question_sources qs
         JOIN public.documents d ON d.id = qs.document_id
         WHERE qs.question_id = $1`,
        [r.id]
      );

      const opts: string[] = Array.isArray(r.options_json)
        ? r.options_json.map((o) => (typeof o === "string" ? o : JSON.stringify(o)))
        : [];

      selectedQuestions.push({
        id: r.id,
        questionText: r.question_text,
        questionType: r.question_type,
        options: opts,
        correctAnswer: r.correct_answer_json ?? r.extracted_answer,
        explanation: r.explanation ?? undefined,
        topic: r.topic,
        difficulty: r.difficulty,
        pageNumber: r.page_number,
        isPastExam: true,
        examYear: r.exam_year,
        sources: srcRows.map((s) => ({
          documentId: s.document_id,
          documentTitle: s.title,
          pageNumber: s.page_number,
          quote: s.quote,
          supportType: s.support_type,
        })),
      });
    }
  }

  // 2. Generate University Style Questions if needed
  if (
    options.practiceType === "UNIVERSITY_STYLE" ||
    (options.practiceType === "MIXED" && selectedQuestions.length < count)
  ) {
    const needed = count - selectedQuestions.length;

    // Fetch past exam style patterns for this subject
    const { rows: stylePatterns } = await pool.query<{
      common_question_types_json: string[];
      avg_difficulty: number;
    }>(
      `SELECT common_question_types_json, avg_difficulty
       FROM public.exam_topic_stats
       WHERE subject_id = $1
       LIMIT 3`,
      [options.subjectId]
    );

    // Retrieve verified curriculum chunks to strictly anchor question generation
    const { rows: curriculumChunks } = await pool.query<{
      id: string;
      document_id: string;
      title: string;
      content: string;
      page_number: number | null;
    }>(
      `SELECT dc.id, dc.document_id, d.title, dc.content, dc.page_number
       FROM public.document_chunks dc
       JOIN public.documents d ON d.id = dc.document_id
       WHERE d.subject_id = $1
         AND d.status = 'ready'
         AND upper(d.source_type) NOT IN ('PAST_EXAM','QUESTION_BANK','QUESTIONS')
         AND ($2::text = '' OR dc.search_vector @@ to_tsquery('simple',$2))
       ORDER BY random()
       LIMIT 8`,
      [options.subjectId, options.topic ? searchTerms(options.topic) : ""]
    );

    if (curriculumChunks.length > 0) {
      const route = routeAIRequest({
        feature: "university_style_exam_gen",
        complexity: "COMPLEX",
      });
      const primary = getProviderByName(route.provider);
      const fallbacks = route.fallbackProviders.map(getProviderByName);

      const chunksContext = curriculumChunks.map((c, i) => `[Source ${i}]: (${c.title}, p.${c.page_number ?? "?"})\n${c.content.slice(0, 1500)}`).join("\n\n");

      try {
        const executed = await executeWithFallback({
          primaryProvider: primary,
          fallbackProviders: fallbacks,
          operation: (p) =>
            p.generateText({
              taskPrompt: `You are a clinical nursing university exam creator.
Generate ${needed} NEW questions in the realistic style of university nursing exams.

STRICT INVARIANTS:
1. Every single question must be grounded in the provided Source excerpts. Do NOT invent facts or clinical values.
2. Formulate realistic clinical vignettes, priority scenarios, or medication questions matching university difficulty.
3. For MCQ, provide exactly 4 clear plausible options, with only ONE definitively correct choice according to the source.
4. Set source_chunk_index to the index of the source used (0 to ${curriculumChunks.length - 1}), and provide an exact quote in evidence_quote.
5. Return JSON adhering to schema.`,
              messages: [
                {
                  role: "user",
                  content: `Faculty-approved Course Excerpts:\n${chunksContext}\n\nPast exam style patterns: ${JSON.stringify(stylePatterns)}\nTarget Difficulty: ${options.difficulty || "MEDIUM"}\nTopic filter: ${options.topic || "All curriculum"}`,
                },
              ],
              jsonSchema: {
                name: "university_style_exam",
                schema: z.toJSONSchema(generatedQuestionSchema),
              },
              maxOutputTokens: 4000,
            }),
          operationName: "Generate University Style Questions",
        });

        const parsed = JSON.parse(extractJson(executed.result.content));
        const validated = generatedQuestionSchema.parse(parsed);

        for (const genQ of validated.questions) {
          const matchedChunk = curriculumChunks[genQ.source_chunk_index];
          if (!matchedChunk || !validQuestionEvidence(matchedChunk.content.slice(0, 1500), genQ.evidence_quote)) continue;
          const verification = await verifyExamQuestion({
            subjectId: options.subjectId,
            questionText: genQ.question_text,
            questionType: genQ.question_type,
            options: genQ.options,
            extractedAnswer: genQ.correct_answer,
            answerOrigin: "generated",
          });
          const evidence = verification.evidence[0];
          if (verification.status !== "VERIFIED" || !verification.verifiedAnswer || !evidence) continue;
          const evidenceTitle = evidence.documentId === matchedChunk.document_id
            ? matchedChunk.title
            : (await pool.query<{ title: string }>("SELECT title FROM public.documents WHERE id=$1", [evidence.documentId])).rows[0]?.title ?? "المصدر المعتمد";

          // Publish a generated question only after independent evidence verification.
          const { rows: insQ } = await pool.query<{ id: string }>(
            `INSERT INTO public.exam_questions (
               subject_id, question_text, question_type, options_json,
               correct_answer_json, explanation, topic, difficulty,
               status, confidence, page_number, source_document_id
              ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, 'VERIFIED', $9, $10, $11)
             RETURNING id`,
            [
              options.subjectId,
              genQ.question_text,
              genQ.question_type,
              JSON.stringify(genQ.options),
              JSON.stringify(verification.verifiedAnswer),
              verification.explanation || genQ.explanation,
              genQ.topic,
              genQ.difficulty,
              Math.min(0.99, Math.max(0.1, verification.confidence)),
              evidence.pageNumber,
              evidence.documentId,
            ]
          );

          const qId = insQ[0].id;

          // Record question_sources
          await pool.query(
            `INSERT INTO public.question_sources (
               question_id, document_id, chunk_id, page_number, quote, support_type, source_priority
             ) VALUES ($1, $2, $3, $4, $5, 'DIRECT', 90)`,
            [
              qId,
              evidence.documentId,
              evidence.chunkId,
              evidence.pageNumber,
              evidence.quote,
            ]
          );

          selectedQuestions.push({
            id: qId,
            questionText: genQ.question_text,
            questionType: genQ.question_type,
            options: genQ.options,
            correctAnswer: verification.verifiedAnswer,
            explanation: verification.explanation || genQ.explanation,
            topic: genQ.topic,
            difficulty: genQ.difficulty,
            pageNumber: evidence.pageNumber,
            isPastExam: false,
            sources: [
              {
                documentId: evidence.documentId,
                documentTitle: evidenceTitle,
                pageNumber: evidence.pageNumber,
                quote: evidence.quote,
                supportType: "DIRECT",
              },
            ],
          });
        }
      } catch (err) {
        console.error("[PracticeExam] Error generating university style questions:", err);
      }
    }
  }

  if (!selectedQuestions.length) {
    throw new Error("لم تتوفر أسئلة بإجابات موثقة في مصادر المادة حاليًا");
  }

  // 3. Create the student attempt in database
  const client = await pool.connect();
  let attemptId: string;
  try {
    await client.query("BEGIN");
    const { rows: attemptRows } = await client.query<{ id: string }>(
      `INSERT INTO public.student_exam_attempts
       (user_id,subject_id,mode,practice_type,total_questions)
       VALUES($1,$2,$3,$4,$5) RETURNING id`,
      [options.userId, options.subjectId, options.mode, options.practiceType, selectedQuestions.length]
    );
    attemptId = attemptRows[0].id;
    await client.query(
      `INSERT INTO public.student_exam_attempt_questions(attempt_id,question_id)
       SELECT $1, unnest($2::uuid[])`,
      [attemptId, selectedQuestions.map((question) => question.id)]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return {
    attemptId,
    mode: options.mode,
    practiceType: options.practiceType,
    questions: selectedQuestions,
  };
}

/**
 * Submits an answer for a question in a practice exam session and updates student memory.
 */
export async function submitQuestionAnswer(input: {
  attemptId: string;
  userId: string;
  questionId: string;
  selectedAnswer: unknown;
}): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{subject_id:string;topic:string;correct_answer_json:unknown}>(
      `SELECT a.subject_id,q.topic,q.correct_answer_json
       FROM public.student_exam_attempts a
       JOIN public.student_exam_attempt_questions aq ON aq.attempt_id=a.id
       JOIN public.exam_questions q ON q.id=aq.question_id
       WHERE a.id=$1 AND a.user_id=$2 AND a.completed_at IS NULL
         AND q.id=$3 AND q.status='VERIFIED'
       FOR UPDATE OF a`,
      [input.attemptId,input.userId,input.questionId]
    );
    const question = rows[0];
    if (!question || question.correct_answer_json == null) throw new Error("السؤال غير تابع لهذه المحاولة أو لا يملك إجابة معتمدة");
    const existing = await client.query<{id:string}>(
      "SELECT id FROM public.student_exam_attempt_answers WHERE attempt_id=$1 AND question_id=$2 LIMIT 1",
      [input.attemptId,input.questionId]
    );
    if (existing.rows.length) { await client.query("COMMIT"); return; }
    const isCorrect = gradePracticeAnswer(input.selectedAnswer, question.correct_answer_json);
    await client.query(
      `INSERT INTO public.student_exam_attempt_answers
       (attempt_id,question_id,selected_answer,is_correct,topic)
       VALUES($1,$2,$3::jsonb,$4,$5)`,
      [input.attemptId,input.questionId,JSON.stringify(input.selectedAnswer ?? null),isCorrect,question.topic]
    );
    const cleanKey = question.topic.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 80) || "general";
    await client.query(
    `INSERT INTO public.student_topic_progress (
       user_id, subject_id, topic_key, topic_name, questions_answered,
       correct_answers, wrong_answers, mastery_score, last_studied_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, 1,
       ${isCorrect ? 1 : 0}, ${isCorrect ? 0 : 1},
       ${isCorrect ? 100 : 0}, now(), now()
     )
     ON CONFLICT (user_id, subject_id, topic_key) DO UPDATE SET
       questions_answered = student_topic_progress.questions_answered + 1,
       correct_answers = student_topic_progress.correct_answers + ${isCorrect ? 1 : 0},
       wrong_answers = student_topic_progress.wrong_answers + ${isCorrect ? 0 : 1},
       mastery_score = round(
         (student_topic_progress.correct_answers + ${isCorrect ? 1 : 0})::numeric * 100.0 /
         (student_topic_progress.questions_answered + 1)
       ),
       last_studied_at = now(),
       updated_at = now()`,
      [input.userId, question.subject_id, cleanKey, question.topic]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Completes a practice exam and calculates final score and weak topics recommendation.
 */
export async function completePracticeExam(attemptId: string, userId: string): Promise<{
  totalQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  unansweredQuestions: number;
  scorePercentage: number;
  weakTopicsRecommendation: string[];
}> {
  const pool = getPool();
  const attempt = await pool.query<{id:string;total_questions:number}>(
    "SELECT id,total_questions FROM public.student_exam_attempts WHERE id=$1 AND user_id=$2",
    [attemptId,userId]
  );
  if (!attempt.rows.length) throw new Error("محاولة التدريب غير متاحة");

  const { rows: stats } = await pool.query<{
    total: number;
    correct: number;
    wrong: number;
  }>(
    `SELECT
       count(*)::int AS total,
       count(*) filter (where is_correct = true)::int AS correct,
       count(*) filter (where is_correct = false)::int AS wrong
     FROM public.student_exam_attempt_answers aa
     JOIN public.student_exam_attempt_questions aq
       ON aq.attempt_id=aa.attempt_id AND aq.question_id=aa.question_id
     WHERE aa.attempt_id = $1`,
    [attemptId]
  );

  const row = stats[0] ?? { total: 0, correct: 0, wrong: 0 };
  const score = attempt.rows[0].total_questions > 0
    ? Math.round((row.correct / attempt.rows[0].total_questions) * 100) : 0;

  await pool.query(
    `UPDATE public.student_exam_attempts
     SET answered_questions = $2,
         correct_answers = $3,
         wrong_answers = $4,
         score_percentage = $5,
         completed_at = now()
     WHERE id = $1 AND user_id=$6`,
    [attemptId, row.total, row.correct, row.wrong, score, userId]
  );

  // Identify weak topics in this exam
  const { rows: weakRows } = await pool.query<{ topic: string; wrong_count: number }>(
    `SELECT topic, count(*)::int AS wrong_count
     FROM public.student_exam_attempt_answers aa
     JOIN public.student_exam_attempt_questions aq
       ON aq.attempt_id=aa.attempt_id AND aq.question_id=aa.question_id
     WHERE aa.attempt_id = $1 AND aa.is_correct = false
     GROUP BY topic
     ORDER BY wrong_count DESC
     LIMIT 3`,
    [attemptId]
  );

  return {
    totalQuestions: attempt.rows[0].total_questions,
    correctAnswers: row.correct,
    wrongAnswers: row.wrong,
    unansweredQuestions: Math.max(0, attempt.rows[0].total_questions - row.total),
    scorePercentage: score,
    weakTopicsRecommendation: weakRows.map((r) => r.topic),
  };
}

/**
 * Smart Review Recommendation:
 * Cross-references exam recurrence frequency with student's weak mastery topics.
 */
export async function getSmartReviewRecommendations(
  userId: string,
  subjectId: string
): Promise<Array<{
  topic: string;
  examFrequency: number;
  studentMastery: number | null;
  recommendationMessage: string;
}>> {
  const pool = getPool();

  const { rows } = await pool.query<{
    topic: string;
    frequency: number;
    mastery_score: number | null;
  }>(
    `SELECT
       ets.topic,
       ets.frequency,
       stp.mastery_score::int AS mastery_score
     FROM public.exam_topic_stats ets
     LEFT JOIN (
       SELECT a.subject_id,lower(aa.topic) AS topic,
         round(100.0*count(*) filter (where aa.is_correct=true)/count(*))::int AS mastery_score
       FROM public.student_exam_attempt_answers aa
       JOIN public.student_exam_attempts a ON a.id=aa.attempt_id
       JOIN public.student_exam_attempt_questions aq
         ON aq.attempt_id=a.id AND aq.question_id=aa.question_id
       WHERE a.user_id=$1
       GROUP BY a.subject_id,lower(aa.topic)
     ) stp ON stp.subject_id=ets.subject_id AND stp.topic=lower(ets.topic)
     WHERE ets.subject_id = $2
       AND ets.frequency >= 40
     ORDER BY (ets.frequency * (100 - coalesce(stp.mastery_score, 50))) DESC
     LIMIT 5`,
    [userId, subjectId]
  );

  return rows.map((r) => ({
    topic: r.topic,
    examFrequency: Number(r.frequency),
    studentMastery: r.mastery_score === null ? null : Number(r.mastery_score),
    recommendationMessage: r.mastery_score === null
      ? `موضوع "${r.topic}" تكرر في ${r.frequency}% من الامتحانات المتاحة، ولم يُقَس إتقانك له بعد.`
      : `موضوع "${r.topic}" تكرر في ${r.frequency}% من الامتحانات المتاحة، وإتقانك المقاس له ${r.mastery_score}%.`,
  }));
}
