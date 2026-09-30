import "server-only";
import {workerDb} from "@/lib/tutor/db";
import { getPool } from "@/lib/db/pool";
import { deleteLectureFile } from "@/lib/storage";
import { logEvent } from "@/lib/log";

// Distinct advisory lock key from the document (73194026) and lecture
// processing (73194027) locks, so a cleanup tick never blocks ingestion.
const CLEANUP_LOCK_KEY = 73194028;

/**
 * Deletes only the raw original file for lectures past their retention
 * window — generated_study_content and lecture_chunks are never touched, so
 * summaries/quizzes/flashcards/chat keep working after the original is gone.
 * A failed deletion leaves deleted_at null, so the next sweep retries it
 * automatically; deleted_at is only set once the delete actually succeeds.
 */
export async function runLectureCleanupSweep(): Promise<void> {
  const lock = await getPool().connect();
  let acquired = false;
  try {
    const result = await lock.query("SELECT pg_try_advisory_lock($1) AS acquired", [CLEANUP_LOCK_KEY]);
    acquired = result.rows[0].acquired;
    if (!acquired) return;
    await sweep();
  } finally {
    try { if (acquired) await lock.query("SELECT pg_advisory_unlock($1)", [CLEANUP_LOCK_KEY]); }
    finally { lock.release(); }
  }
}

async function sweep(): Promise<void> {
  const pool = workerDb;
  const { rows } = await pool.query<{ id: string; storage_path: string }>(
    "SELECT id, storage_path FROM lectures WHERE delete_after <= now() AND deleted_at IS NULL"
  );

  for (const lecture of rows) {
    logEvent("LECTURE_FILE_EXPIRED", { lectureId: lecture.id });
    try {
      await deleteLectureFile(lecture.storage_path);
      await pool.query("UPDATE lectures SET deleted_at = now() WHERE id=$1", [lecture.id]);
      await pool.query(
        "INSERT INTO file_cleanup_logs(lecture_id,storage_path,status) VALUES($1,$2,'success')",
        [lecture.id, lecture.storage_path]
      );
      logEvent("LECTURE_FILE_DELETED", { lectureId: lecture.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      await pool.query(
        "INSERT INTO file_cleanup_logs(lecture_id,storage_path,status,error_message) VALUES($1,$2,'failed',$3)",
        [lecture.id, lecture.storage_path, message]
      );
      logEvent("LECTURE_FILE_DELETE_FAILED", { lectureId: lecture.id, error: message });
    }
  }
}
