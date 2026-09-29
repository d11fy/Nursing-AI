import "server-only";
import { downloadLectureFile } from "@/lib/storage";
import { createSystemClient } from "@/lib/db/server";
import { getAIProvider } from "@/lib/ai";
import { chunkText } from "@/lib/ai/rag";
import { getPool } from "@/lib/db/pool";
import { getAIConfig } from "@/lib/ai/config.mjs";
import { extractPagesFromFile, type ExtractedPage } from "@/lib/knowledge";
import { logUsage } from "@/lib/usage";
import { logEvent } from "@/lib/log";
import { submitContributionIfRequested } from "@/lib/lectures/contribution";
import { toVisionDataUri } from "@/lib/vision-image";
import { transcribePage } from "@/lib/ai/document-ocr";

const EMBEDDING_BATCH_SIZE = 32;
// Distinct advisory lock key from lib/knowledge.ts's document pipeline (73194026)
// so admin document ingestion and student lecture ingestion never block each other.
const LECTURE_LOCK_KEY = 73194027;

async function extractImagePages(buffer: Buffer): Promise<ExtractedPage[]> {
  const provider = getAIProvider();
  const dataUri = await toVisionDataUri(buffer);
  const text = await transcribePage(dataUri,provider);
  return text ? [{ pageNumber: null, text }] : [];
}

async function extractLecturePages(buffer: Buffer, fileName: string, mimeType: string): Promise<ExtractedPage[]> {
  if (mimeType.startsWith("image/")) return extractImagePages(buffer);
  return extractPagesFromFile(buffer, fileName);
}

/**
 * Full ingestion pipeline for one lecture: download -> extract -> chunk ->
 * embed -> store, scoped to the owning student (lecture_chunks, never the
 * shared document_chunks table). Meant to be scheduled with next/server's
 * after() from the upload/retry routes so the HTTP response returns before
 * a large file finishes processing.
 */
export async function processLecture(lectureId: string): Promise<void> {
  const lock = await getPool().connect();
  let acquired = false;
  try {
    const result = await lock.query("SELECT pg_try_advisory_lock($1) AS acquired", [LECTURE_LOCK_KEY]);
    acquired = result.rows[0].acquired;
    if (!acquired) throw new Error("تتم معالجة محاضرة أخرى حاليًا؛ حاول لاحقًا");
    await ingestLecture(lectureId);
  } finally {
    try { if (acquired) await lock.query("SELECT pg_advisory_unlock($1)", [LECTURE_LOCK_KEY]); }
    finally { lock.release(); }
  }
}

async function ingestLecture(lectureId: string): Promise<void> {
  const db = createSystemClient();

  const { data: lecture, error: lectureError } = await db
    .from("lectures")
    .select("id, user_id, subject_id, storage_path, file_name")
    .eq("id", lectureId)
    .single();
  if (lectureError || !lecture) throw new Error(lectureError?.message ?? "Lecture not found");

  await db.from("lectures").update({ status: "processing", processing_started_at: new Date().toISOString() }).eq("id", lectureId);
  logEvent("LECTURE_PROCESS_STARTED", { lectureId });

  try {
    const { content: buffer, mimeType } = await downloadLectureFile(lecture.storage_path);
    const pages = await extractLecturePages(buffer, lecture.file_name, mimeType);
    if (pages.length === 0) throw new Error("لم يتم العثور على نص داخل الملف");

    const deleted = await db.from("lecture_chunks").delete().eq("lecture_id", lectureId);
    if (deleted.error) throw new Error(deleted.error.message);

    const provider = getAIProvider();
    const providerName = getAIConfig().provider;
    let embeddingSpace = "";
    let embeddingModel = "";
    let chunkIndex = 0;
    let totalTokens = 0;

    for (const page of pages) {
      const chunks = chunkText(page.text);
      for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
        const embeddings = await provider.createEmbeddings(batch);
        if (embeddings.length !== batch.length) throw new Error("Embedding count mismatch");
        for (const result of embeddings) {
          const space = `${result.model}:${result.embedding.length}`;
          if (!result.embedding.length || (embeddingSpace && embeddingSpace !== space)) throw new Error("Embedding model/dimensions changed during indexing");
          embeddingSpace = space;
          embeddingModel = result.model;
          totalTokens += result.tokens;
        }
        const rows = batch.map((content, j) => ({
          lecture_id: lectureId,
          user_id: lecture.user_id,
          subject_id: lecture.subject_id,
          content,
          page_number: page.pageNumber,
          chunk_index: chunkIndex++,
          embedding: embeddings[j].embedding,
          embedding_provider: providerName,
          embedding_model: embeddings[j].model,
          embedding_dimensions: embeddings[j].embedding.length,
        }));
        const { error } = await db.from("lecture_chunks").insert(rows);
        if (error) throw new Error(error.message);
      }
    }

    await db.from("lectures").update({ status: "ready", processing_completed_at: new Date().toISOString(), error_message: null }).eq("id", lectureId);
    await logUsage({
      userId: lecture.user_id,
      type: "lecture_processing",
      model: embeddingModel || "unknown",
      inputTokens: totalTokens,
      outputTokens: 0,
      estimatedCost: embeddingModel ? provider.calculateCost({ model: embeddingModel, inputTokens: totalTokens, outputTokens: 0 }) : 0,
      lectureId,
    });
    logEvent("LECTURE_PROCESS_COMPLETED", { lectureId, chunkCount: chunkIndex });
    await submitContributionIfRequested(lectureId).catch((err) => console.error("submitContributionIfRequested error", err));
  } catch (err) {
    const message = err instanceof Error ? err.message : "فشلت المعالجة";
    await db.from("lectures").update({ status: "failed", error_message: message }).eq("id", lectureId);
    logEvent("LECTURE_PROCESS_FAILED", { lectureId, error: message });
    throw err;
  }
}
