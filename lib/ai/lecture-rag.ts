import { createSystemClient } from "@/lib/db/server";
import { getAIProvider } from "@/lib/ai";
import type { KnowledgeChunk } from "@/lib/ai/provider";
import { getAIConfig } from "./config.mjs";
import { getPool } from "@/lib/db/pool";

/**
 * RAG search scoped to a single student's single lecture. Mirrors
 * searchKnowledge() in rag.ts but calls match_lecture_chunks(), which
 * requires and enforces lecture_id + user_id inside the SQL itself — this
 * is defense in depth on top of the ownership check the caller already did.
 * The lecture's title is attached as `chapter` so the existing
 * buildKnowledgeContext() renders "[Source N | <title> — p.X]" with no
 * changes needed to the provider prompt-building code.
 */
export async function searchLectureKnowledge(
  query: string,
  lectureId: string,
  userId: string,
  lectureTitle: string,
  matchCount = 5
): Promise<KnowledgeChunk[]> {
  const config = getAIConfig();
  const eligible = await getPool().query(
    `SELECT 1 FROM lecture_chunks WHERE lecture_id=$1 AND user_id=$2 AND embedding_provider=$3 AND embedding_model=$4 LIMIT 1`,
    [lectureId, userId, config.provider, config.embeddingModel]
  );
  if (!eligible.rows.length) return [];

  const provider = getAIProvider();
  const { embedding, model } = await provider.createEmbedding(query);

  const db = createSystemClient();
  const { data, error } = await db.rpc("match_lecture_chunks", {
    query_embedding: embedding,
    match_lecture_id: lectureId,
    match_user_id: userId,
    match_count: matchCount,
    query_provider: config.provider,
    query_model: model,
  });

  if (error) {
    console.error("searchLectureKnowledge error", error);
    return [];
  }

  return (data ?? [])
    .filter((row) => row.similarity > 0.72)
    .map((row) => ({
      content: row.content,
      chapter: lectureTitle,
      pageNumber: row.page_number,
      similarity: row.similarity,
    }));
}
