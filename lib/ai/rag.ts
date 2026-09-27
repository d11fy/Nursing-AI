import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAIProvider } from "@/lib/ai";
import type { KnowledgeChunk } from "@/lib/ai/provider";

/** Rough token-aware chunking: splits on paragraph boundaries, then packs
 * them into ~chunkSize-character windows so embeddings stay under model
 * limits while keeping semantic units intact. */
export function chunkText(text: string, chunkSize = 1200, overlap = 150): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).length > chunkSize && current) {
      chunks.push(current.trim());
      const words = current.split(" ");
      current = words.slice(Math.max(0, words.length - overlap / 6)).join(" ");
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
  const provider = getAIProvider();
  const { embedding } = await provider.createEmbedding(query);

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: embedding,
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
