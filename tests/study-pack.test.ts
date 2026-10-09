import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { migrate } from "../scripts/migrate.mjs";
import { withIdentity } from "../lib/tutor/db";
import {
  getOrCreateStudyPack,
  getStudyPackById,
  getStudyPackContentRow,
} from "../features/study-pack/db/study-pack-db";
import {
  getStudyPackFlashcards,
  updateFlashcardProgress,
} from "../features/study-pack/db/flashcards-db";
import {
  getLatestQuiz,
  startQuizAttempt,
  submitQuizAnswer,
  completeQuizAttempt,
  getQuizMistakes,
} from "../features/study-pack/db/quiz-db";
import {
  getOrGenerateContent,
  getOrGenerateFlashcards,
  getOrGenerateQuiz,
  getStudyPackWorkspace,
} from "../features/study-pack/services/study-pack-service";
import type { SummaryContent } from "../features/study-pack/types";

const db = new PGlite({ extensions: { vector } });
const studentA = "40000000-0000-4000-8000-000000000001";
const studentB = "40000000-0000-4000-8000-000000000002";
let subjectId: string;
let yearId: string;
let lectureAId: string;
let lectureBId: string;

let tail = Promise.resolve();
async function acquire() {
  let release!: () => void;
  const previous = tail;
  tail = new Promise<void>((r) => {
    release = r;
  });
  await previous;
  return release;
}

async function direct(sql: string, values?: unknown[]) {
  const result = await db.query<Record<string, unknown>>(sql, values);
  for (const row of result.rows) {
    for (const [key, value] of Object.entries(row)) {
      if (value instanceof Uint8Array) row[key] = Buffer.from(value);
    }
  }
  return result;
}

const pool = {
  query: async (sql: string, values?: unknown[]) => {
    const unlock = await acquire();
    try {
      return await direct(sql, values);
    } finally {
      unlock();
    }
  },
  connect: async () => {
    let unlock: (() => void) | undefined;
    return {
      query: async (sql: string, values?: unknown[]) => {
        if (sql === "BEGIN") {
          unlock = await acquire();
          return direct(sql, values);
        }
        if (unlock) {
          try {
            return await direct(sql, values);
          } finally {
            if (sql === "COMMIT" || sql === "ROLLBACK") {
              unlock();
              unlock = undefined;
            }
          }
        }
        const done = await acquire();
        try {
          return await direct(sql, values);
        } finally {
          done();
        }
      },
      release() {
        unlock?.();
        unlock = undefined;
      },
    };
  },
};

before(async () => {
  process.env.DATABASE_URL = "postgresql://test-only";
  process.env.OPENAI_API_KEY = "contract-test-key";
  delete process.env.AI_ARCHITECTURE;
  Object.assign(globalThis, { nursingPool: pool });

  await migrate({
    query: async (sql: string, values?: unknown[]) => {
      if (!values && (sql.includes(";") || sql.includes("--"))) {
        await db.exec(sql);
        return { rows: [] };
      }
      return db.query(sql, values);
    },
  });

  yearId = (
    await db.query<{ id: string }>(
      "SELECT id FROM academic_years WHERE code='first_year'"
    )
  ).rows[0].id;

  subjectId = (
    await db.query<{ id: string }>(
      "INSERT INTO subjects(name_ar, name_en) VALUES('تمريض الباطني والجراحي', 'Medical Surgical Nursing') RETURNING id"
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO subject_academic_years(subject_id, academic_year_id) VALUES($1,$2)",
    [subjectId, yearId]
  );

  // Setup students A & B
  for (const [id, name] of [
    [studentA, "Student A"],
    [studentB, "Student B"],
  ]) {
    await db.query(
      "INSERT INTO app_users(id, email, password_hash) VALUES($1, $2, 'hash')",
      [id, `${id}@example.test`]
    );
    await db.query(
      "INSERT INTO profiles(user_id, email, full_name, role, academic_year_id) VALUES($1, $2, $3, 'student', $4)",
      [id, `${id}@example.test`, name, yearId]
    );
  }

  // Setup Lectures for student A
  lectureAId = (
    await db.query<{ id: string }>(
      `INSERT INTO lectures(user_id, subject_id, title, file_name, original_file_name, storage_path, mime_type, file_size_bytes, file_hash, status)
       VALUES($1, $2, 'Heart Failure Lecture', 'heart_failure.pdf', 'heart_failure.pdf', 'files/hf.pdf', 'application/pdf', 1024000, 'hash_hf_v1', 'ready')
       RETURNING id`,
      [studentA, subjectId]
    )
  ).rows[0].id;

  // Setup Knowledge Document & Extracted Pages for lecture A
  const pagesJson = JSON.stringify([
    {
      pageNumber: 1,
      text: "Heart Failure Overview: Inability of heart to pump sufficient blood. Left-sided failure causes pulmonary congestion and dyspnea (ضيق التنفس).",
    },
    {
      pageNumber: 2,
      text: "Clinical Manifestations: Paroxysmal nocturnal dyspnea, orthopnea, elevated jugular venous pressure. Ejection fraction assessment.",
    },
  ]);
  await db.query(
    `INSERT INTO knowledge_documents(lecture_id, owner_id, title, original_file_name, storage_path, subject_id, source_type, file_hash, status, extracted_pages_json, is_active, extracted_text_length, chunk_count, embedding_count, page_count)
     VALUES($1, $2, 'Heart Failure Lecture', 'heart_failure.pdf', 'files/hf.pdf', $3, 'student_private_file', 'hash_hf_v1', 'ready', $4::jsonb, true, 260, 2, 2, 2)`,
    [lectureAId, studentA, subjectId, pagesJson]
  );

  // Setup lecture for student B
  lectureBId = (
    await db.query<{ id: string }>(
      `INSERT INTO lectures(user_id, subject_id, title, file_name, original_file_name, storage_path, mime_type, file_size_bytes, file_hash, status)
       VALUES($1, $2, 'Pneumonia Lecture', 'pneumonia.pdf', 'pneumonia.pdf', 'files/pne.pdf', 'application/pdf', 512000, 'hash_pne_v1', 'ready')
       RETURNING id`,
      [studentB, subjectId]
    )
  ).rows[0].id;

  await db.exec(
    "CREATE ROLE study_pack_runtime NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO study_pack_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO study_pack_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO study_pack_runtime;"
  );
});

after(() => db.close());

test("E2E Scenario 1: Study Pack becomes ready when lecture is ready and provides workspace", async () => {
  const pack = await getOrCreateStudyPack(lectureAId, studentA);
  assert.ok(pack.id);
  assert.equal(pack.title, "Heart Failure Lecture");
  assert.equal(pack.status, "ready");
  assert.equal(pack.source_hash, "hash_hf_v1");

  const workspace = await getStudyPackWorkspace(lectureAId, studentA);
  assert.equal(workspace.studyPack.id, pack.id);
  assert.equal(workspace.lecture.title, "Heart Failure Lecture");
  assert.equal(workspace.subject.nameAr, "تمريض الباطني والجراحي");
  assert.equal(workspace.pages.length, 2);
  assert.equal(workspace.summaryStatus, "not_generated");
  assert.equal(workspace.keyPointsStatus, "not_generated");
});

test("E2E Scenario 2: Lazy generation, caching, and idempotency of Summary", async (t) => {
  let aiCalls = 0;
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => {
    if (String(url).includes("/chat/completions") || String(url).includes("/responses")) {
      aiCalls++;
      const summaryPayload = {
        overview: "Heart failure impairs cardiac output and tissue perfusion.",
        main_concepts: [
          {
            concept: "Left-sided Heart Failure",
            explanation: "Results in pulmonary congestion and respiratory distress.",
            arabic_term: "فشل القلب الأيسر",
          },
        ],
        important_definitions: [
          {
            term: "Dyspnea",
            arabic_translation: "ضيق التنفس",
            definition: "Difficult or labored breathing.",
          },
        ],
        clinical_notes: [
          {
            note: "Monitor fluid balance and daily weights closely.",
            importance: "High",
          },
        ],
        what_to_remember: ["Orthopnea is common", "Check ejection fraction"],
        source_references: ["Page 1", "Page 2"],
      };

      return Response.json({
        id: "mock-resp-1",
        status: "completed",
        model: "gpt-6-luna",
        output_text: JSON.stringify(summaryPayload),
        output: [],
        usage: { input_tokens: 200, output_tokens: 150, input_tokens_details: { cached_tokens: 0 } },
      });
    }
    return Response.json({});
  });

  const pack = await getOrCreateStudyPack(lectureAId, studentA);

  // 1. First generation: calls AI and saves to DB
  const first = await getOrGenerateContent({
    studyPackId: pack.id,
    contentType: "summary",
    userId: studentA,
    regenerate: false,
  });
  assert.equal(first.fromCache, false);
  assert.equal(first.status, "ready");
  assert.equal(aiCalls, 1);
  assert.equal((first.content as SummaryContent).overview, "Heart failure impairs cardiac output and tissue perfusion.");

  // 2. Second access: loads from database cache, 0 AI calls
  const second = await getOrGenerateContent({
    studyPackId: pack.id,
    contentType: "summary",
    userId: studentA,
    regenerate: false,
  });
  assert.equal(second.fromCache, true);
  assert.equal(second.status, "ready");
  assert.equal(aiCalls, 1); // No new AI call!
  assert.equal((second.content as SummaryContent).overview, (first.content as SummaryContent).overview);
});

test("E2E Scenario 3: Flashcards generation, review ratings, and progress persistence", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => {
    if (String(url).includes("/chat/completions") || String(url).includes("/responses")) {
      const flashcardsPayload = {
        cards: [
          {
            front: "What is the primary cause of pulmonary congestion in heart failure?",
            back: "Left-sided ventricular failure causing backward fluid buildup into the lungs.",
            card_type: "concept",
            explanation: "Elevated left atrial pressure.",
            topic: "Pulmonary Congestion",
          },
          {
            front: "Define Dyspnea in Arabic and English.",
            back: "Difficult breathing — ضيق التنفس.",
            card_type: "definition",
            explanation: "Symptom of respiratory compromise.",
            topic: "Terminology",
          },
        ],
      };
      return Response.json({
        id: "mock-cards",
        status: "completed",
        model: "gpt-6-luna",
        output_text: JSON.stringify(flashcardsPayload),
        output: [],
        usage: { input_tokens: 180, output_tokens: 120, input_tokens_details: { cached_tokens: 0 } },
      });
    }
    return Response.json({});
  });

  const pack = await getOrCreateStudyPack(lectureAId, studentA);
  const { cards } = await getOrGenerateFlashcards({
    studyPackId: pack.id,
    userId: studentA,
  });
  assert.equal(cards.length, 2);

  // Review Card 1 -> Known
  const p1 = await updateFlashcardProgress(studentA, cards[0].id, "known");
  assert.equal(p1.status, "known");
  assert.equal(p1.review_count, 1);

  // Review Card 2 -> Review Again
  const p2 = await updateFlashcardProgress(studentA, cards[1].id, "review_again");
  assert.equal(p2.status, "review_again");
  assert.equal(p2.review_count, 1);

  // Refresh and verify persistence
  const reloaded = await getStudyPackFlashcards(pack.id, studentA);
  assert.equal(reloaded[0].progress_status, "known");
  assert.equal(reloaded[1].progress_status, "review_again");
});

test("E2E Scenario 4 & 5: Quiz flow, mistake tracking with topic, and Review Mistakes", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => {
    if (String(url).includes("/chat/completions") || String(url).includes("/responses")) {
      const quizPayload = {
        title: "Heart Failure Practice Quiz",
        questions: [
          {
            question_type: "mcq",
            question: "Which condition commonly causes pulmonary congestion?",
            options: ["Left-sided Heart Failure", "Appendicitis", "Hypoglycemia", "Fracture"],
            correct_answer: "Left-sided Heart Failure",
            rationale: "Left-sided failure increases pulmonary venous pressure, leading to fluid extravasation into alveoli.",
            topic: "Pulmonary Congestion",
            difficulty: "medium",
          },
          {
            question_type: "true_false",
            question: "Orthopnea refers to difficulty breathing while standing.",
            options: ["True", "False"],
            correct_answer: "False",
            rationale: "Orthopnea is dyspnea that occurs when lying flat, relieved by sitting or standing.",
            topic: "Clinical Manifestations",
            difficulty: "easy",
          },
        ],
      };
      return Response.json({
        id: "mock-quiz",
        status: "completed",
        model: "gpt-6-luna",
        output_text: JSON.stringify(quizPayload),
        output: [],
        usage: { input_tokens: 220, output_tokens: 160, input_tokens_details: { cached_tokens: 0 } },
      });
    }
    return Response.json({});
  });

  const pack = await getOrCreateStudyPack(lectureAId, studentA);
  const { quiz } = await getOrGenerateQuiz({
    studyPackId: pack.id,
    userId: studentA,
    config: { questionCount: 2, difficulty: "medium", questionType: "mixed" },
  });
  assert.equal(quiz.questions.length, 2);

  // Start attempt
  const attempt = await startQuizAttempt(studentA, quiz.id);
  assert.ok(attempt.id);

  // Answer Q1 correctly
  const q1Result = await submitQuizAnswer({
    userId: studentA,
    attemptId: attempt.id,
    questionId: quiz.questions[0].id,
    studentAnswer: "Left-sided Heart Failure",
  });
  assert.equal(q1Result.isCorrect, true);

  // Answer Q2 incorrectly
  const q2Result = await submitQuizAnswer({
    userId: studentA,
    attemptId: attempt.id,
    questionId: quiz.questions[1].id,
    studentAnswer: "True", // Wrong, correct is False
  });
  assert.equal(q2Result.isCorrect, false);
  assert.equal(q2Result.correctAnswer, "False");

  // Complete attempt
  const completion = await completeQuizAttempt(studentA, attempt.id);
  assert.equal(completion.totalQuestions, 2);
  assert.equal(completion.correctCount, 1);
  assert.equal(completion.score, 50);
  assert.deepEqual(completion.missedTopics, ["Clinical Manifestations"]);

  // Verify Mistakes are stored properly for Weak Topics & My Mistakes
  const mistakes = await getQuizMistakes(pack.id, studentA, attempt.id);
  assert.equal(mistakes.length, 1);
  assert.equal(mistakes[0].topic, "Clinical Manifestations");
  assert.equal(mistakes[0].student_answer, "True");
  assert.equal(mistakes[0].correct_answer, "False");
  assert.ok(mistakes[0].question?.rationale.includes("lying flat"));
});

test("E2E Scenario 7: Student B cannot access Student A's Study Pack (RLS & Authorization)", async () => {
  const packA = await getOrCreateStudyPack(lectureAId, studentA);

  // Attempting to access Student A's pack as Student B
  const foreignPack = await getStudyPackById(packA.id, studentB);
  assert.equal(foreignPack, null);

  const foreignCards = await getStudyPackFlashcards(packA.id, studentB);
  assert.equal(foreignCards.length, 0);

  const foreignQuiz = await getLatestQuiz(packA.id, studentB);
  assert.equal(foreignQuiz, null);

  // Direct injection attempt to student A's lecture by student B throws ownership error
  await assert.rejects(
    getOrCreateStudyPack(lectureAId, studentB),
    /المحاضرة غير موجودة أو ليس لديك صلاحية الوصول إليها/
  );
});

test("E2E Scenario 8 & 9: Concurrency idempotency lock and error handling", async () => {
  const pack = await getOrCreateStudyPack(lectureAId, studentA);

  // Manually put status in 'generating'
  await withIdentity(studentA, async (client) => {
    await client.query(
      `INSERT INTO study_pack_content (study_pack_id, content_type, content_json, source_hash, generation_status, updated_at)
       VALUES ($1, 'key_points', '{}'::jsonb, $2, 'generating', now())
       ON CONFLICT (study_pack_id, content_type)
       DO UPDATE SET generation_status = 'generating', updated_at = now()`,
      [pack.id, pack.source_hash]
    );
  });

  // Second quick click while status is 'generating' is rejected cleanly
  await assert.rejects(
    getOrGenerateContent({
      studyPackId: pack.id,
      contentType: "key_points",
      userId: studentA,
    }),
    /جارٍ إنشاء هذا القسم حاليًا/
  );
});

test("E2E Scenario 10: File hash change marks old generated content as outdated", async () => {
  const pack = await getOrCreateStudyPack(lectureAId, studentA);

  // Update lecture hash to simulate modified/reuploaded file
  await db.query(
    "UPDATE lectures SET file_hash = 'hash_hf_v2_updated' WHERE id = $1",
    [lectureAId]
  );

  // Calling getOrCreateStudyPack detects changed hash
  const updatedPack = await getOrCreateStudyPack(lectureAId, studentA);
  assert.equal(updatedPack.source_hash, "hash_hf_v2_updated");

  // Existing summary content should now be marked 'outdated'
  const summaryRow = await getStudyPackContentRow(pack.id, "summary", studentA);
  assert.equal(summaryRow?.generation_status, "outdated");
});
