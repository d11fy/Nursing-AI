import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { downloadKnowledgeDocument } from "@/lib/storage";
import { createSystemClient } from "@/lib/db/server";
import { getAIProvider } from "@/lib/ai";
import { chunkText } from "@/lib/ai/rag";
import { getPool } from "@/lib/db/pool";
import { getAIConfig } from "@/lib/ai/config.mjs";

const EMBEDDING_BATCH_SIZE = 32;

export interface ExtractedPage {
  pageNumber: number | null;
  text: string;
}

export async function extractPagesFromFile(
  buffer: Buffer,
  fileName: string
): Promise<ExtractedPage[]> {
  const ext = fileName.split(".").pop()?.toLowerCase();

  if (ext === "pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.pages
        .map((p) => ({ pageNumber: p.num, text: p.text.trim() }))
        .filter((p) => p.text.length > 0);
    } finally {
      await parser.destroy();
    }
  }

  if (ext === "docx") {
    const { value } = await mammoth.extractRawText({ buffer });
    return [{ pageNumber: null, text: value.trim() }];
  }

  if (ext === "txt") {
    return [{ pageNumber: null, text: buffer.toString("utf-8").trim() }];
  }

  throw new Error("نوع الملف غير مدعوم");
}

/**
 * Full RAG ingestion pipeline for one document: download -> extract ->
 * chunk -> embed -> store. Runs synchronously inside the upload/reprocess
 * request (no background job queue in the MVP), so it updates the
 * document's status as it goes for the admin UI to reflect progress on
 * the next page load.
 */
export async function processDocument(documentId: string): Promise<void> {
  const lock = await getPool().connect();
  let acquired = false;
  try {
    const result = await lock.query("SELECT pg_try_advisory_lock(73194026) AS acquired");
    acquired = result.rows[0].acquired;
    if (!acquired) throw new Error("تتم معالجة ملف آخر حاليًا؛ حاول بعد انتهاء المعالجة");
    await ingestDocument(documentId);
  } finally {
    try { if (acquired) await lock.query("SELECT pg_advisory_unlock(73194026)"); }
    finally { lock.release(); }
  }
}

async function ingestDocument(documentId: string): Promise<void> {
  const db = createSystemClient();

  const { data: doc, error: docError } = await db
    .from("documents")
    .select("id, file_url, file_name, subject_id")
    .eq("id", documentId)
    .single();

  if (docError || !doc) throw new Error(docError?.message ?? "Document not found");

  const processing = await db.from("documents").update({ status: "processing" }).eq("id", documentId);
  if (processing.error) throw new Error(processing.error.message);

  try {
    const buffer = await downloadKnowledgeDocument(doc.file_url);
    const pages = await extractPagesFromFile(buffer, doc.file_name);

    if (pages.length === 0) throw new Error("لم يتم العثور على نص داخل الملف");

    // Remove any chunks from a previous processing attempt (reprocess).
    const deleted = await db.from("document_chunks").delete().eq("document_id", documentId);
    if (deleted.error) throw new Error(deleted.error.message);

    const provider = getAIProvider();
    const providerName = getAIConfig().provider;
    let embeddingSpace = "";
    let chunkIndex = 0;
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
        }
        const rows = batch.map((content, j) => ({
            document_id: documentId,
            subject_id: doc.subject_id,
            content,
            page_number: page.pageNumber,
            chunk_index: chunkIndex++,
            embedding: embeddings[j].embedding,
            embedding_provider: providerName,
            embedding_model: embeddings[j].model,
            embedding_dimensions: embeddings[j].embedding.length,
        }));
        const { error } = await db.from("document_chunks").insert(rows);
        if (error) throw new Error(error.message);
      }
    }

    const ready = await db
      .from("documents")
      .update({ status: "ready", chunk_count: chunkIndex, error_message: null })
      .eq("id", documentId);
    if (ready.error) throw new Error(ready.error.message);
  } catch (err) {
    await db
      .from("documents")
      .update({
        status: "failed",
        error_message: err instanceof Error ? err.message : "فشلت المعالجة",
      })
      .eq("id", documentId);
    throw err;
  }
}
