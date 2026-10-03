import "server-only";
import { identityDb, withIdentity } from "@/lib/tutor/db";
import type { FlashcardItem, FlashcardStatus } from "../types";

export async function getStudyPackFlashcards(
  studyPackId: string,
  userId: string
): Promise<FlashcardItem[]> {
  const db = identityDb(userId);
  const res = await db.query<{
    id: string;
    study_pack_id: string;
    front: string;
    back: string;
    card_type: string | null;
    explanation: string | null;
    source_reference: string | null;
    topic: string | null;
    sort_order: number;
    created_at: string;
    progress_status: FlashcardStatus | null;
    review_count: number | null;
    last_reviewed_at: string | null;
  }>(
    `SELECT f.*,
            COALESCE(p.status, 'new') as progress_status,
            COALESCE(p.review_count, 0) as review_count,
            p.last_reviewed_at
     FROM study_pack_flashcards f
     JOIN study_packs sp ON sp.id = f.study_pack_id
     LEFT JOIN student_flashcard_progress p ON p.flashcard_id = f.id AND p.user_id = $2
     WHERE f.study_pack_id = $1 AND sp.user_id = $2
     ORDER BY f.sort_order ASC, f.created_at ASC`,
    [studyPackId, userId]
  );

  return res.rows.map((row) => ({
    id: row.id,
    study_pack_id: row.study_pack_id,
    front: row.front,
    back: row.back,
    card_type: row.card_type,
    explanation: row.explanation,
    source_reference: row.source_reference,
    topic: row.topic,
    sort_order: row.sort_order,
    created_at: row.created_at,
    progress_status: row.progress_status ?? "new",
    review_count: row.review_count ?? 0,
    last_reviewed_at: row.last_reviewed_at,
  }));
}

export async function saveStudyPackFlashcards(
  studyPackId: string,
  cards: Array<{
    front: string;
    back: string;
    card_type?: string | null;
    explanation?: string | null;
    source_reference?: string | null;
    topic?: string | null;
  }>,
  userId: string
): Promise<FlashcardItem[]> {
  return withIdentity(userId, async (client) => {
    // Delete previous cards if regenerating
    await client.query("DELETE FROM study_pack_flashcards WHERE study_pack_id = $1", [studyPackId]);

    const inserted: FlashcardItem[] = [];
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const res = await client.query<FlashcardItem>(
        `INSERT INTO study_pack_flashcards (study_pack_id, front, back, card_type, explanation, source_reference, topic, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [studyPackId, c.front, c.back, c.card_type ?? null, c.explanation ?? null, c.source_reference ?? null, c.topic ?? null, i]
      );
      inserted.push({
        ...res.rows[0],
        progress_status: "new",
        review_count: 0,
        last_reviewed_at: null,
      });
    }
    return inserted;
  });
}

export async function updateFlashcardProgress(
  userId: string,
  flashcardId: string,
  status: "known" | "review_again"
): Promise<{ status: FlashcardStatus; review_count: number }> {
  return withIdentity(userId, async (client) => {
    // Verify flashcard belongs to user's study pack
    const verify = await client.query(
      `SELECT f.id FROM study_pack_flashcards f
       JOIN study_packs sp ON sp.id = f.study_pack_id
       WHERE f.id = $1 AND sp.user_id = $2`,
      [flashcardId, userId]
    );
    if (verify.rows.length === 0) throw new Error("البطاقة غير موجودة");

    const res = await client.query<{ status: FlashcardStatus; review_count: number }>(
      `INSERT INTO student_flashcard_progress (user_id, flashcard_id, status, review_count, last_reviewed_at)
       VALUES ($1, $2, $3, 1, now())
       ON CONFLICT (user_id, flashcard_id)
       DO UPDATE SET status = EXCLUDED.status,
                     review_count = student_flashcard_progress.review_count + 1,
                     last_reviewed_at = now()
       RETURNING status, review_count`,
      [userId, flashcardId, status]
    );
    return res.rows[0];
  });
}
