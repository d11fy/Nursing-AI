import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAIProvider } from "@/lib/ai";
import { chunkText } from "@/lib/ai/rag";

const EMBEDDING_BATCH_SIZE = 50;

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
  const supabase = createServiceRoleClient();

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("id, file_url, file_name, subject_id")
    .eq("id", documentId)
    .single();

  if (docError || !doc) return;

  await supabase.from("documents").update({ status: "processing" }).eq("id", documentId);

  try {
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("knowledge-documents")
      .download(doc.file_url);

    if (downloadError || !fileBlob) throw new Error("تعذر تحميل الملف من المخزن");

    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    const pages = await extractPagesFromFile(buffer, doc.file_name);

    if (pages.length === 0) throw new Error("لم يتم العثور على نص داخل الملف");

    // Remove any chunks from a previous processing attempt (reprocess).
    await supabase.from("document_chunks").delete().eq("document_id", documentId);

    const provider = getAIProvider();
    let chunkIndex = 0;
    const pendingRows: {
      document_id: string;
      subject_id: string | null;
      content: string;
      page_number: number | null;
      chunk_index: number;
      embedding: number[];
    }[] = [];

    for (const page of pages) {
      const chunks = chunkText(page.text);
      for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
        const embeddings = await provider.createEmbeddings(batch);
        batch.forEach((content, j) => {
          pendingRows.push({
            document_id: documentId,
            subject_id: doc.subject_id,
            content,
            page_number: page.pageNumber,
            chunk_index: chunkIndex++,
            embedding: embeddings[j].embedding,
          });
        });
      }
    }

    // Insert in batches to stay well under request size limits.
    for (let i = 0; i < pendingRows.length; i += 200) {
      const { error: insertError } = await supabase
        .from("document_chunks")
        .insert(pendingRows.slice(i, i + 200));
      if (insertError) throw new Error(insertError.message);
    }

    await supabase
      .from("documents")
      .update({ status: "ready", chunk_count: pendingRows.length, error_message: null })
      .eq("id", documentId);
  } catch (err) {
    await supabase
      .from("documents")
      .update({
        status: "failed",
        error_message: err instanceof Error ? err.message : "فشلت المعالجة",
      })
      .eq("id", documentId);
  }
}
