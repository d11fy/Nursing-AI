import { createSystemClient } from "@/lib/db/server";
import { getAIProvider } from "@/lib/ai";
import type { KnowledgeChunk } from "@/lib/ai/provider";
import { getAIConfig } from "./config.mjs";
import { getPool } from "@/lib/db/pool";

/** Rough token-aware chunking: splits on paragraph boundaries, then packs
 * them into ~chunkSize-character windows so embeddings stay under model
 * limits while keeping semantic units intact. */
export function chunkText(text: string, chunkSize = 1200, overlap = 150): string[] {
  if (chunkSize <= 0 || overlap < 0 || overlap >= chunkSize) throw new Error("Invalid chunk size/overlap");
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((paragraph) => {
      const parts: string[] = [];
      for (let start = 0; start < paragraph.length; start += chunkSize - overlap) {
        parts.push(paragraph.slice(start, start + chunkSize));
        if (start + chunkSize >= paragraph.length) break;
      }
      return parts;
    });

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).length > chunkSize && current) {
      chunks.push(current.trim());
      const available = Math.max(0, chunkSize - paragraph.length - 2);
      const tailLength = Math.min(overlap, available);
      current = tailLength ? current.slice(-tailLength) : "";
    }
    current += (current ? "\n\n" : "") + paragraph;
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export async function searchKnowledge(
  query: string,
  subjectId: string | null,
  matchCount = 5
): Promise<KnowledgeChunk[]> {
  const config = getAIConfig();
  // Avoid loading the embedding model for an empty or incompatible knowledge base.
  const eligible = await getPool().query(
    `SELECT 1 FROM document_chunks dc JOIN documents d ON d.id = dc.document_id
     WHERE d.status = 'ready' AND dc.embedding_provider = $1 AND dc.embedding_model = $2
       AND ($3::uuid IS NULL OR dc.subject_id = $3) LIMIT 1`,
    [config.provider, config.embeddingModel, subjectId]
  );
  if (!eligible.rows.length) return [];
  const provider = getAIProvider();
  const { embedding, model } = await provider.createEmbedding(query);

  const db = createSystemClient();
  const { data, error } = await db.rpc("match_document_chunks", {
    query_embedding: embedding,
    query_provider: config.provider,
    query_model: model,
    match_subject_id: subjectId,
    match_count: matchCount,
  });

  if (error) {
    console.error("searchKnowledge error", error);
    return [];
  }

  return (data ?? [])
    .filter((row) => row.similarity > 0.72)
    .map((row) => ({
      content: row.content,
      chapter: row.chapter,
      pageNumber: row.page_number,
      similarity: row.similarity,
    }));
}
