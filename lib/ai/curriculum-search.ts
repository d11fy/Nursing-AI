import "server-only";
import { getPool } from "@/lib/db/pool";
import { getAIProvider } from "@/lib/ai";
import { getAIConfig } from "./config.mjs";
import type { EmbeddingResult, KnowledgeChunk } from "./provider";

export type SearchScope = { userId: string; subjectId: string | null; lectureId: string | null };
type Candidate = {
  id: string; document_id: string; title: string; subject_name: string | null;
  source_type: string; content: string; chapter: string | null; page_number: number | null;
  chunk_index: number; similarity: number; rank: number;
};

export function searchTerms(query: string): string {
  const normalized = query.toLowerCase().replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي")
    .replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/[ًٌٍَُِّْـ]/g, "");
  const stop = new Set(["اشرح", "اشرحلي", "ما", "هي", "هو", "عن", "من", "في", "الى", "كيف", "ليش", "the", "a", "of", "is", "what", "explain", "and", "in"]);
  return [...new Set(normalized.match(/[\p{L}\p{N}]+/gu) ?? [])]
    .filter(t => t.length > 1 && !stop.has(t)).slice(0, 24).join(" | ");
}

/** Bound scope on every branch, including keyword results and neighbour expansion.
 * A selected lecture is exclusive; private uploads never enter shared retrieval. */
export function candidateQuery(scope: SearchScope) {
  const lecture = Boolean(scope.lectureId);
  const table = lecture ? "lecture_chunks" : "document_chunks";
  const parent = lecture ? "lectures" : "documents";
  const parentKey = lecture ? "lecture_id" : "document_id";
  const access = lecture
    ? "d.id=$3 AND d.user_id=$1 AND c.user_id=$1"
    : `($2::uuid IS NULL OR d.subject_id=$2) AND
       (p.role='admin' OR d.subject_id IS NULL OR EXISTS (
         SELECT 1 FROM subject_academic_years sy JOIN academic_years ay ON ay.id=sy.academic_year_id AND ay.is_active=true
         WHERE sy.subject_id=d.subject_id AND sy.academic_year_id=p.academic_year_id))
       AND (s.id IS NULL OR (s.status='active' AND s.archived_at IS NULL))`;
  const common = `FROM ${table} c JOIN ${parent} d ON d.id=c.${parentKey}
    LEFT JOIN subjects s ON s.id=d.subject_id JOIN profiles p ON p.user_id=$1 AND p.status='active'
    WHERE d.status='ready' AND ($2::uuid IS NULL OR true) AND ${access}`;
  const metadata = lecture ? "to_tsvector('simple',normalize_search_text(d.title))" : "d.search_vector";
  const type = lecture ? "'lecture'::text" : "d.source_type::text";
  // Query params are stable across both modes; $3 is consumed even in curriculum mode.
  const sql = `WITH semantic AS (
    SELECT c.id, cosine_similarity(c.embedding,$4::double precision[]) AS similarity
    ${common} AND ($3::uuid IS NULL OR ${lecture ? "d.id=$3" : "false"})
    AND c.embedding_provider=$5 AND c.embedding_model=$6
    AND c.embedding_dimensions=cardinality($4::double precision[])
    ORDER BY similarity DESC NULLS LAST, c.id LIMIT 24
  ), lexical AS (
    SELECT c.id, ts_rank_cd(c.search_vector,to_tsquery('simple',$7)) +
      2*ts_rank_cd(${metadata},to_tsquery('simple',$7)) AS score
    ${common} AND $7<>'' AND (c.search_vector @@ to_tsquery('simple',$7) OR ${metadata} @@ to_tsquery('simple',$7))
    ORDER BY score DESC,c.id LIMIT 24
  ), votes AS (
    SELECT id,1.0/(60+row_number() OVER(ORDER BY similarity DESC NULLS LAST,id)) AS score
      FROM semantic WHERE similarity IS NOT NULL
    UNION ALL
    SELECT id,1.0/(60+row_number() OVER(ORDER BY score DESC,id)) FROM lexical
  ), ranked AS (SELECT id,sum(score) AS rank FROM votes GROUP BY id)
  SELECT c.id,d.id AS document_id,d.title,s.name_ar AS subject_name,${type} AS source_type,
    c.content,${lecture ? "NULL::text" : "c.chapter"} AS chapter,c.page_number,c.chunk_index,
    coalesce((SELECT similarity FROM semantic WHERE id=c.id),0) AS similarity,
    (SELECT rank FROM ranked WHERE id=c.id) AS rank
  ${common} AND c.id IN (SELECT id FROM ranked)
  ORDER BY (SELECT rank FROM ranked WHERE id=c.id) DESC,c.id LIMIT 24`;
  return { sql, table, parent, parentKey, common };
}

export async function retrieveCurriculum(queries: string[], scope: SearchScope, limit = 8, onEmbedding?: (result: EmbeddingResult) => void): Promise<KnowledgeChunk[]> {
  const variants = [...new Set(queries.map(q => q.trim()).filter(Boolean))].slice(0, 3);
  if (!variants.length) return [];
  const config = getAIConfig();
  const embeddings = await getAIProvider().createEmbeddings(variants);
  if (embeddings.length !== variants.length) throw new Error("Incomplete query embeddings");
  embeddings.forEach(result => onEmbedding?.(result));
  const query = candidateQuery(scope);
  const lists = await Promise.all(variants.map(async (variant, i) => {
    const vector = embeddings[i];
    if (!vector.embedding.length || !vector.embedding.every(Number.isFinite)) throw new Error("Invalid query embedding");
    return (await getPool().query<Candidate>(query.sql, [scope.userId,scope.subjectId,scope.lectureId,
      vector.embedding,config.provider,vector.model,searchTerms(variant)])).rows;
  }));
  const merged = new Map<string, Candidate>();
  for (const list of lists) for (const [position, row] of list.entries()) {
    const current = merged.get(row.id);
    merged.set(row.id, { ...row, rank: (current?.rank ?? 0) + 1/(60+position+1) });
  }
  const ordered = [...merged.values()].sort((a,b) => b.rank-a.rank);
  const selected: Candidate[] = [];
  const seenText = new Set<string>();
  // Remove identical content from duplicated uploads.
  for (const row of ordered) {
    const key = row.content.replace(/\s+/g, " ").trim();
    if (!seenText.has(key)) { selected.push(row); seenText.add(key); }
    if (selected.length >= Math.max(1,Math.min(limit,24))) break;
  }
  if (!selected.length) return [];
  const ids = selected.map(r => r.id);
  const neighbourFrom = query.common.replace("LEFT JOIN subjects", `JOIN ${query.table} anchor
    ON anchor.id=ANY($4::uuid[]) AND anchor.${query.parentKey}=c.${query.parentKey}
    AND c.page_number IS NOT DISTINCT FROM anchor.page_number AND abs(c.chunk_index-anchor.chunk_index)<=1
    LEFT JOIN subjects`);
  const neighbours = await getPool().query<{anchor_id:string;content:string;chunk_index:number}>(`
    SELECT anchor.id AS anchor_id,c.content,c.chunk_index ${neighbourFrom}
    AND ($3::uuid IS NULL OR ${scope.lectureId ? "d.id=$3" : "false"})
    ORDER BY c.chunk_index`, [scope.userId,scope.subjectId,scope.lectureId,ids]).catch(() => null);
  // Neighbours are optional; retrieval errors above must propagate (not masquerade as NO_SOURCE).
  return selected.map(row => ({ id: row.id, documentId: row.document_id, title: row.title,
    subjectName: row.subject_name, sourceType: row.source_type, chapter: row.chapter,
    pageNumber: row.page_number, similarity: row.similarity, chunkIndex: row.chunk_index,
    evidenceType: scope.lectureId ? "PRIVATE_LECTURE" as const
      : row.source_type === "lecture" || row.source_type === "notes" ? "UNIVERSITY_SOURCE" as const
      : row.source_type === "book" ? "TEXTBOOK" as const : "SUPPLEMENTARY" as const,
    content: (neighbours?.rows.filter(n => n.anchor_id===row.id).map(n => n.content).join("\n\n") || row.content).slice(0,3600),
  }));
}
