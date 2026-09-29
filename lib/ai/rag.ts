import { createSystemClient } from "@/lib/db/server";
import { getAIProvider } from "@/lib/ai";
import type { KnowledgeChunk } from "@/lib/ai/provider";
import { getAIConfig } from "./config.mjs";
import { getPool } from "@/lib/db/pool";

/** Keep paragraph/sentence/word boundaries where possible and overlap context within a page. */
export function chunkText(text: string, chunkSize = 1800, overlap = 250): string[] {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0 || overlap < 0 || overlap >= chunkSize) throw new Error("Invalid chunk size/overlap");
  const cleaned = text.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim();
  const chunks: string[] = [];
  let start = 0;
  while (start < cleaned.length) {
    let end = Math.min(start + chunkSize, cleaned.length);
    if (end < cleaned.length) {
      const window = cleaned.slice(start,end);
      const floor = Math.floor(chunkSize * 0.55);
      const breaks = [window.lastIndexOf("\n\n"), ...[...window.matchAll(/[.!?؟]\s/g)].map(m => m.index! + 1), window.lastIndexOf(" ")];
      const boundary = breaks.find(i => i >= floor);
      if (boundary !== undefined) end = start + boundary;
    }
    const chunk = cleaned.slice(start,end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= cleaned.length) break;
    let next = Math.max(start+1,end-overlap);
    // Start at a complete word without skipping any previously unseen content.
    while (next < end && next > 0 && !/\s/.test(cleaned[next-1])) next++;
    start = next;
  }
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
