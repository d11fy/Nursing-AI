import 'server-only';
import { identityDb, withIdentity } from './db';
import type { DocumentOutline } from './structure';
import type { ChunkMeta, PlanItem, StudyState } from './study-plan';
import type { KnowledgeChunk } from '@/lib/ai/provider';

export type StudyDocument = {
  id: string;
  title: string;
  ownerId: string | null;
  subjectId: string | null;
  subjectName: string | null;
  sourceType: string;
  outline: DocumentOutline | null;
  structureVersion: number;
  status: string;
  chunkCount: number;
};

/** Loads a document the student may read (row-level security applies). */
export async function loadStudyDocument(userId: string, documentId: string): Promise<StudyDocument | null> {
  const row = (await identityDb(userId).query<{ id: string; title: string; owner_id: string | null; subject_id: string | null; name_en: string | null; source_type: string;
    outline_json: DocumentOutline | null; structure_version: number; status: string; chunk_count: number }>(
  `select d.id,d.title,d.owner_id,d.subject_id,s.name_en,d.source_type,d.outline_json,d.structure_version,d.status,d.chunk_count
     from knowledge_documents d left join subjects s on s.id=d.subject_id
     where d.id=$1 and d.status='ready' and (d.owner_id=$2 or d.owner_id is null)`, [documentId, userId])).rows[0];
  return row ? { id: row.id, title: row.title, ownerId: row.owner_id, subjectId: row.subject_id, subjectName: row.name_en, sourceType: row.source_type,
    outline: row.outline_json, structureVersion: row.structure_version, status: row.status, chunkCount: row.chunk_count } : null;
}

export async function listChunkMeta(userId: string, documentId: string, chapterIndex: number | null): Promise<ChunkMeta[]> {
  const rows = (await identityDb(userId).query<{ id: string; chunk_index: number; token_count: number; page_number: number | null; section_title: string | null; subsection_title: string | null }>(
    `select id,chunk_index,token_count,page_number,section_title,subsection_title from knowledge_chunks
       where document_id=$1 and ($2::int is null or chapter_index=$2) order by chunk_index`, [documentId, chapterIndex])).rows;
  return rows.map((row) => ({ id: row.id, chunkIndex: row.chunk_index, tokenCount: row.token_count, pageNumber: row.page_number,
    sectionTitle: row.section_title, subsectionTitle: row.subsection_title }));
}

/** Chunks of an inclusive page (or slide) range, in book order. */
export async function listPageRangeMeta(userId: string, documentId: string, start: number, end: number): Promise<ChunkMeta[]> {
  const rows = (await identityDb(userId).query<{ id: string; chunk_index: number; token_count: number; page_number: number | null; section_title: string | null; subsection_title: string | null }>(
    `select id,chunk_index,token_count,page_number,section_title,subsection_title from knowledge_chunks
       where document_id=$1 and page_number between $2 and $3 order by chunk_index`, [documentId, start, end])).rows;
  return rows.map((row) => ({ id: row.id, chunkIndex: row.chunk_index, tokenCount: row.token_count, pageNumber: row.page_number,
    sectionTitle: row.section_title, subsectionTitle: row.subsection_title }));
}

type ChunkRow = { id: string; chunk_index: number; content: string; page_number: number | null; chapter_index: number | null; chapter_number: number | null;
  chapter_title: string | null; section_title: string | null; subsection_title: string | null };

/** Turns plan items into evidence: consecutive chunks are merged in book order, nothing is trimmed. */
export async function loadEvidence(userId: string, document: StudyDocument, items: PlanItem[]): Promise<KnowledgeChunk[]> {
  const ids = items.flatMap((item) => item.chunks.map((chunk) => chunk.id));
  if (!ids.length) return [];
  const rows = (await identityDb(userId).query<ChunkRow>(`select id,chunk_index,content,page_number,chapter_index,chapter_number,chapter_title,section_title,subsection_title
    from knowledge_chunks where id=any($1::uuid[]) and document_id=$2`, [ids, document.id])).rows;
  const byId = new Map(rows.map((row) => [row.id, row]));
  return items.flatMap((item): KnowledgeChunk[] => {
    const parts = item.chunks.map((chunk) => byId.get(chunk.id)).filter((row): row is ChunkRow => Boolean(row));
    if (!parts.length) return [];
    const first = parts[0], pages = parts.map((row) => row.page_number).filter((page): page is number => page !== null);
    return [{
      id: first.id, documentId: document.id, title: document.title, subjectName: document.subjectName, sourceType: document.sourceType,
      content: parts.map((row) => row.content).join('\n\n'), chapter: first.chapter_title, pageNumber: pages.length ? Math.min(...pages) : null,
      pageEnd: pages.length ? Math.max(...pages) : null, chunkIndex: first.chunk_index, similarity: 1,
      evidenceType: document.ownerId ? 'PRIVATE_LECTURE' : 'UNIVERSITY_SOURCE', chapterIndex: first.chapter_index, chapterNumber: first.chapter_number,
      chapterTitle: first.chapter_title, sectionTitle: first.section_title, subsectionTitle: first.subsection_title, chunkIds: parts.map((row) => row.id),
    }];
  });
}

type StateRow = { current_document_id: string | null; current_chapter_index: number | null; current_chapter_number: number | null; current_chapter_title: string | null;
  current_section_title: string | null; current_part: number | null; total_parts: number | null; current_position: number | null; study_mode: string | null };

export function stateFromSummary(row: Partial<StateRow> | null | undefined): StudyState | null {
  if (!row?.current_document_id) return null;
  return { documentId: row.current_document_id, chapterIndex: row.current_chapter_index ?? null, chapterNumber: row.current_chapter_number ?? null,
    chapterTitle: row.current_chapter_title ?? null, sectionTitle: row.current_section_title ?? null, part: row.current_part ?? null,
    totalParts: row.total_parts ?? null, position: row.current_position ?? null, mode: row.study_mode ?? null };
}

export async function loadStudyState(userId: string, conversationId: string): Promise<StudyState | null> {
  const row = (await identityDb(userId).query<StateRow>('select * from conversation_summaries where conversation_id=$1 and user_id=$2', [conversationId, userId])).rows[0];
  return stateFromSummary(row);
}

/** Upserts the study position. Called the moment the answer is saved, so "كمل" always knows where it stopped. */
export async function saveStudyState(userId: string, conversationId: string, state: StudyState): Promise<void> {
  await withIdentity(userId, async (db) => {
    await db.query(`insert into conversation_summaries(conversation_id,user_id,current_document_id,current_chapter_index,current_chapter_number,current_chapter_title,
        current_section_title,current_part,total_parts,current_position,study_mode,study_updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
      on conflict(conversation_id) do update set current_document_id=excluded.current_document_id,current_chapter_index=excluded.current_chapter_index,
        current_chapter_number=excluded.current_chapter_number,current_chapter_title=excluded.current_chapter_title,current_section_title=excluded.current_section_title,
        current_part=excluded.current_part,total_parts=excluded.total_parts,current_position=excluded.current_position,study_mode=excluded.study_mode,
        study_updated_at=now(),updated_at=now() where conversation_summaries.user_id=excluded.user_id`,
    [conversationId, userId, state.documentId, state.chapterIndex, state.chapterNumber, state.chapterTitle, state.sectionTitle, state.part, state.totalParts, state.position, state.mode]);
  });
}
