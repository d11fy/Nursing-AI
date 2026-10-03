import "server-only";
import { identityDb, withIdentity } from "@/lib/tutor/db";
import type { QuizDifficulty, QuizItem, QuizQuestionItem, StudentMistakeItem } from "../types";

export async function getLatestQuiz(
  studyPackId: string,
  userId: string
): Promise<QuizItem | null> {
  const db = identityDb(userId);

  const quizRes = await db.query<{
    id: string;
    study_pack_id: string;
    title: string;
    difficulty: QuizDifficulty;
    question_count: number;
    created_at: string;
  }>(
    `SELECT q.* FROM study_pack_quizzes q
     JOIN study_packs sp ON sp.id = q.study_pack_id
     WHERE q.study_pack_id = $1 AND sp.user_id = $2
     ORDER BY q.created_at DESC LIMIT 1`,
    [studyPackId, userId]
  );
  const quiz = quizRes.rows[0];
  if (!quiz) return null;

  const questionsRes = await db.query<{
    id: string;
    quiz_id: string;
    question_type: "mcq" | "true_false";
    question: string;
    options_json: string[];
    correct_answer: string;
    rationale: string;
    source_reference: string | null;
    difficulty: string;
    topic: string;
    sort_order: number;
  }>(
    `SELECT * FROM study_pack_questions
     WHERE quiz_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [quiz.id]
  );

  return {
    id: quiz.id,
    study_pack_id: quiz.study_pack_id,
    title: quiz.title,
    difficulty: quiz.difficulty,
    question_count: quiz.question_count,
    created_at: quiz.created_at,
    questions: questionsRes.rows.map((q) => ({
      id: q.id,
      quiz_id: q.quiz_id,
      question_type: q.question_type,
      question: q.question,
      options: Array.isArray(q.options_json) ? q.options_json : [],
      correct_answer: q.correct_answer,
      rationale: q.rationale,
      source_reference: q.source_reference,
      difficulty: q.difficulty,
      topic: q.topic,
      sort_order: q.sort_order,
    })),
  };
}

export async function saveQuiz(
  studyPackId: string,
  title: string,
  difficulty: QuizDifficulty,
  questions: Array<{
    question_type: "mcq" | "true_false";
    question: string;
    options: string[];
    correct_answer: string;
    rationale: string;
    topic: string;
    difficulty?: string;
    source_reference?: string | null;
  }>,
  userId: string
): Promise<QuizItem> {
  return withIdentity(userId, async (client) => {
    // 1. Create quiz header
    const quizRes = await client.query<{
      id: string;
      study_pack_id: string;
      title: string;
      difficulty: QuizDifficulty;
      question_count: number;
      created_at: string;
    }>(
      `INSERT INTO study_pack_quizzes (study_pack_id, title, difficulty, question_count)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [studyPackId, title, difficulty, questions.length]
    );
    const quiz = quizRes.rows[0];

    // 2. Insert questions
    const savedQuestions: QuizQuestionItem[] = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qRes = await client.query<QuizQuestionItem>(
        `INSERT INTO study_pack_questions (quiz_id, question_type, question, options_json, correct_answer, rationale, source_reference, difficulty, topic, sort_order)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          quiz.id,
          q.question_type,
          q.question,
          JSON.stringify(q.options),
          q.correct_answer,
          q.rationale,
          q.source_reference ?? null,
          q.difficulty ?? difficulty,
          q.topic || "General",
          i,
        ]
      );
      savedQuestions.push({
        ...qRes.rows[0],
        options: q.options,
      });
    }

    return {
      ...quiz,
      questions: savedQuestions,
    };
  });
}

export async function startQuizAttempt(
  userId: string,
  quizId: string
): Promise<{ id: string; started_at: string }> {
  return withIdentity(userId, async (client) => {
    // Verify quiz ownership
    const verify = await client.query(
      `SELECT q.id FROM study_pack_quizzes q
       JOIN study_packs sp ON sp.id = q.study_pack_id
       WHERE q.id = $1 AND sp.user_id = $2`,
      [quizId, userId]
    );
    if (verify.rows.length === 0) throw new Error("الاختبار غير موجود");

    const res = await client.query<{ id: string; started_at: string }>(
      `INSERT INTO student_quiz_attempts (user_id, quiz_id, score, correct_count, total_questions)
       VALUES ($1, $2, 0, 0, 0)
       RETURNING id, started_at`,
      [userId, quizId]
    );
    return res.rows[0];
  });
}

export async function submitQuizAnswer(params: {
  userId: string;
  attemptId: string;
  questionId: string;
  studentAnswer: string;
}): Promise<{
  isCorrect: boolean;
  correctAnswer: string;
  rationale: string;
  topic: string;
}> {
  const { userId, attemptId, questionId, studentAnswer } = params;

  return withIdentity(userId, async (client) => {
    // 1. Verify attempt ownership & get question info
    const infoRes = await client.query<{
      attempt_id: string;
      study_pack_id: string;
      subject_id: string;
      correct_answer: string;
      rationale: string;
      topic: string;
    }>(
      `SELECT a.id as attempt_id, sp.id as study_pack_id, sp.subject_id,
              q.correct_answer, q.rationale, q.topic
       FROM student_quiz_attempts a
       JOIN study_pack_quizzes sq ON sq.id = a.quiz_id
       JOIN study_packs sp ON sp.id = sq.study_pack_id
       JOIN study_pack_questions q ON q.quiz_id = sq.id
       WHERE a.id = $1 AND a.user_id = $2 AND q.id = $3`,
      [attemptId, userId, questionId]
    );

    const info = infoRes.rows[0];
    if (!info) throw new Error("بيانات السؤال أو المحاولة غير صحيحة");

    // Standardize comparison (trim and lowercase for true/false or exact match for mcq)
    const isCorrect =
      info.correct_answer.trim().toLowerCase() === studentAnswer.trim().toLowerCase();

    // 2. Save answer
    await client.query(
      `INSERT INTO student_quiz_answers (attempt_id, question_id, student_answer, is_correct)
       VALUES ($1, $2, $3, $4)`,
      [attemptId, questionId, studentAnswer, isCorrect]
    );

    // 3. If incorrect, record mistake immediately for future "My Mistakes" & "Weak Topics"
    if (!isCorrect) {
      await client.query(
        `INSERT INTO student_mistakes (user_id, subject_id, study_pack_id, question_id, topic, student_answer, correct_answer, attempt_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          userId,
          info.subject_id,
          info.study_pack_id,
          questionId,
          info.topic,
          studentAnswer,
          info.correct_answer,
          attemptId,
        ]
      );

      // Record learning event
      await client.query(
        `INSERT INTO learning_events (user_id, subject_id, topic, event_type, result, metadata)
         VALUES ($1, $2, $3, 'quiz_incorrect', false, $4::jsonb)`,
        [
          userId,
          info.subject_id,
          info.topic,
          JSON.stringify({ study_pack_id: info.study_pack_id, question_id: questionId }),
        ]
      );
    } else {
      // Record correct event
      await client.query(
        `INSERT INTO learning_events (user_id, subject_id, topic, event_type, result, metadata)
         VALUES ($1, $2, $3, 'quiz_correct', true, $4::jsonb)`,
        [
          userId,
          info.subject_id,
          info.topic,
          JSON.stringify({ study_pack_id: info.study_pack_id, question_id: questionId }),
        ]
      );
    }

    return {
      isCorrect,
      correctAnswer: info.correct_answer,
      rationale: info.rationale,
      topic: info.topic,
    };
  });
}

export async function completeQuizAttempt(
  userId: string,
  attemptId: string
): Promise<{
  attemptId: string;
  totalQuestions: number;
  correctCount: number;
  score: number;
  missedTopics: string[];
}> {
  return withIdentity(userId, async (client) => {
    // Get all answers for this attempt
    const answersRes = await client.query<{
      is_correct: boolean;
      topic: string;
    }>(
      `SELECT ans.is_correct, q.topic
       FROM student_quiz_answers ans
       JOIN study_pack_questions q ON q.id = ans.question_id
       JOIN student_quiz_attempts a ON a.id = ans.attempt_id
       WHERE ans.attempt_id = $1 AND a.user_id = $2`,
      [attemptId, userId]
    );

    const rows = answersRes.rows;
    const totalQuestions = rows.length;
    const correctCount = rows.filter((r) => r.is_correct).length;
    const score = totalQuestions > 0 ? Number(((correctCount / totalQuestions) * 100).toFixed(1)) : 0;

    const missedTopics = Array.from(
      new Set(rows.filter((r) => !r.is_correct).map((r) => r.topic))
    ).filter(Boolean);

    await client.query(
      `UPDATE student_quiz_attempts
       SET score = $1, correct_count = $2, total_questions = $3, completed_at = now()
       WHERE id = $4 AND user_id = $5`,
      [score, correctCount, totalQuestions, attemptId, userId]
    );

    return {
      attemptId,
      totalQuestions,
      correctCount,
      score,
      missedTopics,
    };
  });
}

export async function getQuizMistakes(
  studyPackId: string,
  userId: string,
  attemptId?: string | null
): Promise<StudentMistakeItem[]> {
  const db = identityDb(userId);

  const query = attemptId
    ? `SELECT m.*,
              q.question_type, q.question, q.options_json, q.correct_answer, q.rationale, q.source_reference, q.difficulty, q.sort_order
       FROM student_mistakes m
       JOIN study_pack_questions q ON q.id = m.question_id
       WHERE m.study_pack_id = $1 AND m.user_id = $2 AND m.attempt_id = $3
       ORDER BY m.created_at ASC`
    : `SELECT DISTINCT ON (m.question_id) m.*,
              q.question_type, q.question, q.options_json, q.correct_answer, q.rationale, q.source_reference, q.difficulty, q.sort_order
       FROM student_mistakes m
       JOIN study_pack_questions q ON q.id = m.question_id
       WHERE m.study_pack_id = $1 AND m.user_id = $2
       ORDER BY m.question_id, m.created_at DESC`;

  const values = attemptId ? [studyPackId, userId, attemptId] : [studyPackId, userId];
  const res = await db.query<{
    id: string;
    user_id: string;
    subject_id: string;
    study_pack_id: string;
    question_id: string;
    topic: string;
    student_answer: string;
    correct_answer: string;
    attempt_id: string | null;
    resolved: boolean;
    created_at: string;
    question_type: "mcq" | "true_false";
    question: string;
    options_json: string[];
    rationale: string;
    source_reference: string | null;
    difficulty: string;
    sort_order: number;
  }>(query, values);

  return res.rows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    subject_id: row.subject_id,
    study_pack_id: row.study_pack_id,
    question_id: row.question_id,
    topic: row.topic,
    student_answer: row.student_answer,
    correct_answer: row.correct_answer,
    attempt_id: row.attempt_id,
    resolved: row.resolved,
    created_at: row.created_at,
    question: {
      id: row.question_id,
      quiz_id: "",
      question_type: row.question_type,
      question: row.question,
      options: Array.isArray(row.options_json) ? row.options_json : [],
      correct_answer: row.correct_answer,
      rationale: row.rationale,
      source_reference: row.source_reference,
      difficulty: row.difficulty,
      topic: row.topic,
      sort_order: row.sort_order,
    },
  }));
}
