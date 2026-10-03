import "server-only";
import {
  getOrCreateStudyPack,
  getStudyPackById,
  getStudyPackContentRow,
  setStudyPackContentStatus,
  saveStudyPackContent,
  getExtractedPagesForLecture,
} from "../db/study-pack-db";
import {
  getStudyPackFlashcards,
  saveStudyPackFlashcards,
} from "../db/flashcards-db";
import {
  getLatestQuiz,
  saveQuiz,
} from "../db/quiz-db";
import {
  generateSummary,
  generateKeyPoints,
  generateFlashcards,
  generateQuiz,
} from "./generator";
import { identityDb } from "@/lib/tutor/db";
import type {
  StudyPackWorkspaceData,
  StudyContentType,
  SummaryContent,
  KeyPointsContent,
  FlashcardItem,
  QuizItem,
  QuizDifficulty,
} from "../types";

export async function getStudyPackWorkspace(
  lectureId: string,
  userId: string
): Promise<StudyPackWorkspaceData> {
  const db = identityDb(userId);

  // 1. Get or create the study pack
  const studyPack = await getOrCreateStudyPack(lectureId, userId);

  // 2. Fetch lecture details & subject details
  const [lectureRes, subjectRes, summaryRow, keyPointsRow, flashcardsRes, quizRes, pages] =
    await Promise.all([
      db.query<{
        id: string;
        title: string;
        file_name: string;
        file_size_bytes: number;
        mime_type: string;
        status: string;
        uploaded_at: string;
        delete_after: string | null;
      }>(
        `SELECT id, title, file_name, file_size_bytes, mime_type, status, uploaded_at, delete_after
         FROM lectures WHERE id = $1 AND user_id = $2`,
        [lectureId, userId]
      ),
      db.query<{ id: string; name_ar: string; name_en: string }>(
        "SELECT id, name_ar, name_en FROM subjects WHERE id = $1",
        [studyPack.subject_id]
      ),
      getStudyPackContentRow(studyPack.id, "summary", userId),
      getStudyPackContentRow(studyPack.id, "key_points", userId),
      db.query<{ count: string }>(
        "SELECT COUNT(*)::text as count FROM study_pack_flashcards WHERE study_pack_id = $1",
        [studyPack.id]
      ),
      db.query<{ count: string }>(
        "SELECT COUNT(*)::text as count FROM study_pack_quizzes WHERE study_pack_id = $1",
        [studyPack.id]
      ),
      getExtractedPagesForLecture(lectureId, userId),
    ]);

  const lecture = lectureRes.rows[0];
  const subject = subjectRes.rows[0];
  if (!lecture || !subject) throw new Error("بيانات المحاضرة أو المادة غير متوفرة");

  const summaryStatus = summaryRow?.generation_status ?? "not_generated";
  const keyPointsStatus = keyPointsRow?.generation_status ?? "not_generated";

  return {
    studyPack,
    lecture: {
      id: lecture.id,
      title: lecture.title,
      fileName: lecture.file_name,
      fileSizeBytes: Number(lecture.file_size_bytes),
      mimeType: lecture.mime_type,
      status: lecture.status,
      uploadedAt: lecture.uploaded_at,
      deleteAfter: lecture.delete_after,
    },
    subject: {
      id: subject.id,
      nameAr: subject.name_ar,
      nameEn: subject.name_en,
    },
    pages,
    summaryStatus,
    keyPointsStatus,
    flashcardsCount: Number(flashcardsRes.rows[0]?.count ?? 0),
    quizzesCount: Number(quizRes.rows[0]?.count ?? 0),
    initialSummary:
      summaryStatus === "ready" && summaryRow?.content_json
        ? (summaryRow.content_json as SummaryContent)
        : null,
    initialKeyPoints:
      keyPointsStatus === "ready" && keyPointsRow?.content_json
        ? (keyPointsRow.content_json as KeyPointsContent)
        : null,
  };
}

export async function getOrGenerateContent(params: {
  studyPackId: string;
  contentType: StudyContentType;
  userId: string;
  regenerate?: boolean;
}): Promise<{
  content: SummaryContent | KeyPointsContent;
  fromCache: boolean;
  status: "ready";
}> {
  const { studyPackId, contentType, userId, regenerate = false } = params;

  const studyPack = await getStudyPackById(studyPackId, userId);
  if (!studyPack) throw new Error("حزمة الدراسة غير موجودة");

  // Check cache
  const existing = await getStudyPackContentRow(studyPackId, contentType, userId);
  if (
    !regenerate &&
    existing &&
    existing.generation_status === "ready" &&
    existing.source_hash === studyPack.source_hash &&
    existing.content_json &&
    Object.keys(existing.content_json as object).length > 0
  ) {
    return {
      content: existing.content_json as SummaryContent | KeyPointsContent,
      fromCache: true,
      status: "ready",
    };
  }

  // Idempotency lock check: prevent duplicate simultaneous generations
  if (existing?.generation_status === "generating") {
    // If generation started less than 35 seconds ago, treat as busy
    const startedAt = new Date(existing.updated_at).getTime();
    if (Date.now() - startedAt < 35_000) {
      throw new Error("جارٍ إنشاء هذا القسم حاليًا، الرجاء الانتظار لحظات");
    }
  }

  // Set status to generating
  await setStudyPackContentStatus(studyPackId, contentType, "generating", studyPack.source_hash, userId);

  try {
    const pages = await getExtractedPagesForLecture(studyPack.lecture_id, userId);
    if (!pages.length) throw new Error("لا يوجد محتوى نصي مستخرج لهذه المحاضرة");

    const genContext = {
      lectureId: studyPack.lecture_id,
      userId,
      lectureTitle: studyPack.title,
      materials: pages,
    };

    let generated: SummaryContent | KeyPointsContent;
    if (contentType === "summary") {
      generated = await generateSummary(genContext);
    } else {
      generated = await generateKeyPoints(genContext);
    }

    await saveStudyPackContent(studyPackId, contentType, generated, studyPack.source_hash, userId);

    return {
      content: generated,
      fromCache: false,
      status: "ready",
    };
  } catch (err) {
    await setStudyPackContentStatus(studyPackId, contentType, "failed", studyPack.source_hash, userId);
    throw err;
  }
}

export async function getOrGenerateFlashcards(params: {
  studyPackId: string;
  userId: string;
  regenerate?: boolean;
}): Promise<{
  cards: FlashcardItem[];
  fromCache: boolean;
}> {
  const { studyPackId, userId, regenerate = false } = params;

  const studyPack = await getStudyPackById(studyPackId, userId);
  if (!studyPack) throw new Error("حزمة الدراسة غير موجودة");

  if (!regenerate) {
    const existingCards = await getStudyPackFlashcards(studyPackId, userId);
    if (existingCards.length > 0) {
      return { cards: existingCards, fromCache: true };
    }
  }

  const pages = await getExtractedPagesForLecture(studyPack.lecture_id, userId);
  if (!pages.length) throw new Error("لا يوجد محتوى نصي مستخرج لإنشاء البطاقات");

  const cards = await generateFlashcards({
    lectureId: studyPack.lecture_id,
    userId,
    lectureTitle: studyPack.title,
    materials: pages,
  });

  const saved = await saveStudyPackFlashcards(studyPackId, cards, userId);
  return { cards: saved, fromCache: false };
}

export async function getOrGenerateQuiz(params: {
  studyPackId: string;
  userId: string;
  config: {
    questionCount: number;
    difficulty: QuizDifficulty;
    questionType: "mcq" | "true_false" | "mixed";
  };
  regenerate?: boolean;
}): Promise<{
  quiz: QuizItem;
  fromCache: boolean;
}> {
  const { studyPackId, userId, config, regenerate = false } = params;

  const studyPack = await getStudyPackById(studyPackId, userId);
  if (!studyPack) throw new Error("حزمة الدراسة غير موجودة");

  if (!regenerate) {
    const existingQuiz = await getLatestQuiz(studyPackId, userId);
    if (existingQuiz) {
      return { quiz: existingQuiz, fromCache: true };
    }
  }

  const pages = await getExtractedPagesForLecture(studyPack.lecture_id, userId);
  if (!pages.length) throw new Error("لا يوجد محتوى نصي مستخرج لإنشاء الاختبار");

  const generated = await generateQuiz(
    {
      lectureId: studyPack.lecture_id,
      userId,
      lectureTitle: studyPack.title,
      materials: pages,
    },
    config
  );

  const saved = await saveQuiz(
    studyPackId,
    generated.title,
    config.difficulty,
    generated.questions,
    userId
  );

  return { quiz: saved, fromCache: false };
}
