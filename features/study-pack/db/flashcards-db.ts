import "server-only";
import { identityDb, withIdentity } from "@/lib/tutor/db";
import type { FlashcardItem, FlashcardStatus } from "../types";
import { normalizeTopicIdentity } from "@/lib/learning-progress/formula";
import { recalculateStudentTopicProgress } from "@/lib/learning-progress/service";

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
    next_review_at: string | null;
    interval_days: number;
  }>(
    `SELECT f.*,
            COALESCE(p.status, 'new') as progress_status,
            COALESCE(p.review_count, 0) as review_count,
            p.last_reviewed_at, p.next_review_at, p.interval_days
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
    next_review_at: row.next_review_at, interval_days: row.interval_days ?? 0,
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
  status: "known" | "review_again",
  eventId?: string, studyPackId?: string
): Promise<{ status: FlashcardStatus; review_count: number; next_review_at: string; interval_days: number }> {
  return withIdentity(userId, async (client) => {
    // Verify flashcard belongs to user's study pack
    const verify = await client.query<{ id: string; topic: string; subject_id: string }>(
      `SELECT f.id,coalesce(f.topic,'General') as topic,sp.subject_id FROM study_pack_flashcards f
       JOIN study_packs sp ON sp.id = f.study_pack_id
       WHERE f.id = $1 AND sp.user_id = $2 AND ($3::uuid IS NULL OR sp.id=$3) FOR UPDATE OF f`,
      [flashcardId, userId, studyPackId ?? null]
    );
    if (verify.rows.length === 0) throw new Error("البطاقة غير موجودة");
    if(eventId) {
      const existing=(await client.query<{result: {status: FlashcardStatus; review_count: number; next_review_at: string; interval_days: number};flashcard_id:string}>(
        "select result,flashcard_id from flashcard_review_receipts where user_id=$1 and event_id=$2",[userId,eventId])).rows[0];
      if(existing) {if(existing.flashcard_id!==flashcardId) throw new Error("معرف مراجعة مستخدم مسبقًا"); return existing.result;}
    }
    const card = verify.rows[0];
    const topic = normalizeTopicIdentity(card.topic);

    const res = await client.query<{ status: FlashcardStatus; review_count: number; next_review_at: string; interval_days: number }>(
      `INSERT INTO student_flashcard_progress (user_id, flashcard_id, status, review_count, last_reviewed_at, topic_key, interval_days, next_review_at)
       VALUES ($1, $2, $3, 1, now(), $4, case when $3='known' then 1 else 0 end,
         now()+case when $3='known' then interval '1 day' else interval '10 minutes' end)
       ON CONFLICT (user_id, flashcard_id)
       DO UPDATE SET status = EXCLUDED.status,
                     review_count = student_flashcard_progress.review_count + 1,
                     last_reviewed_at = now(),topic_key=excluded.topic_key,
                     interval_days=case when excluded.status='known' then least(60,greatest(1,student_flashcard_progress.interval_days*2)) else 0 end,
                     next_review_at=now()+case when excluded.status='known' then least(60,greatest(1,student_flashcard_progress.interval_days*2))*interval '1 day' else interval '10 minutes' end
       RETURNING status, review_count, next_review_at, interval_days`,
      [userId, flashcardId, status, topic.topicKey]
    );
    await client.query(
      `insert into student_learning_events(user_id,subject_id,event_type,topic_key,metadata_json)
       values($1,$2,$3,$4,$5::jsonb)`,
      [userId, card.subject_id, status === "known" ? "FLASHCARD_KNOWN" : "FLASHCARD_REVIEW_AGAIN",
        topic.topicKey, JSON.stringify({ flashcardId })]
    );
    await recalculateStudentTopicProgress({ userId, subjectId: card.subject_id, topic: card.topic, client,
      reason: "flashcard_review", recordHistory: true });
    if(eventId) await client.query("insert into flashcard_review_receipts(user_id,event_id,flashcard_id,result) values($1,$2,$3,$4::jsonb)",
      [userId,eventId,flashcardId,JSON.stringify(res.rows[0])]);
    return res.rows[0];
  });
}
