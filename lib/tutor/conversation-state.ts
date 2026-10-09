import 'server-only';
import { identityDb } from './db';
import { STALE_AFTER_SECONDS } from './generations';
import type { DocumentOutline } from './structure';

export type ConversationStudyView = {
  activeDocument: { id: string; title: string; kind: 'private' | 'library'; chapterCount: number; confidence: string } | null;
  studyContext: { chapterIndex: number | null; chapterNumber: number | null; chapterTitle: string | null; sectionTitle: string | null;
    part: number | null; totalParts: number | null; position: number | null } | null;
  outline: Array<{ index: number; number: number | null; title: string; label: string; sections: number }>;
  /** The newest question that has no saved answer (still running, interrupted or failed). */
  pendingGeneration: { requestId: string; status: 'pending' | 'streaming' | 'failed' | 'cancelled'; retryable: boolean; userMessageId: string | null } | null;
};

/**
 * Everything the app needs to resume a conversation after a restart: the active book, the chapter position
 * and any question whose answer is not yet on screen. It is read from the server, never from app memory.
 */
export async function loadConversationStudyView(userId: string, conversationId: string): Promise<ConversationStudyView> {
  const db = identityDb(userId);
  const state = (await db.query<{ lecture_id: string | null; current_document_id: string | null; current_chapter_index: number | null; current_chapter_number: number | null;
    current_chapter_title: string | null; current_section_title: string | null; current_part: number | null; total_parts: number | null; current_position: number | null }>(
  `select c.lecture_id,s.current_document_id,s.current_chapter_index,s.current_chapter_number,s.current_chapter_title,s.current_section_title,s.current_part,s.total_parts,s.current_position
     from conversations c left join conversation_summaries s on s.conversation_id=c.id and s.user_id=c.user_id where c.id=$1 and c.user_id=$2`, [conversationId, userId])).rows[0];
  if (!state) return { activeDocument: null, studyContext: null, outline: [], pendingGeneration: null };
  const privateDocument = state.lecture_id ? (await db.query<{ id: string }>('select id from knowledge_documents where lecture_id=$1 and owner_id=$2', [state.lecture_id, userId])).rows[0]?.id : undefined;
  const library = !privateDocument && !state.current_document_id ? (await db.query<{ id: string }>(`select document_id id from conversation_sources
    where conversation_id=$1 and user_id=$2 and is_active order by updated_at desc limit 1`, [conversationId, userId])).rows[0]?.id : undefined;
  const documentId = privateDocument ?? state.current_document_id ?? library ?? null;
  const document = documentId ? (await db.query<{ id: string; title: string; owner_id: string | null; outline_json: DocumentOutline | null; chapter_count: number; structure_confidence: string | null }>(
    `select id,title,owner_id,outline_json,chapter_count,structure_confidence from knowledge_documents where id=$1 and status='ready' and (owner_id=$2 or owner_id is null)`, [documentId, userId])).rows[0] : undefined;
  const generation = (await db.query<{ request_id: string; status: 'pending' | 'streaming' | 'failed' | 'cancelled'; user_message_id: string | null; stale: boolean }>(
    `select g.request_id,g.status,g.user_message_id,(g.status in ('pending','streaming') and g.updated_at < now() - make_interval(secs => ${STALE_AFTER_SECONDS})) stale
       from chat_generations g where g.conversation_id=$1 and g.user_id=$2 and g.status<>'completed'
       and not exists(select 1 from chat_generations later where later.conversation_id=g.conversation_id and later.created_at>g.created_at and later.status='completed')
       order by g.created_at desc limit 1`, [conversationId, userId])).rows[0];
  const outline = document?.outline_json?.chapters ?? [];
  const sameDocument = Boolean(document && state.current_document_id === document.id);
  return {
    activeDocument: document ? { id: document.id, title: document.title, kind: document.owner_id ? 'private' : 'library', chapterCount: document.chapter_count,
      confidence: document.structure_confidence ?? 'none' } : null,
    studyContext: sameDocument && state.current_chapter_index !== null ? { chapterIndex: state.current_chapter_index, chapterNumber: state.current_chapter_number,
      chapterTitle: state.current_chapter_title, sectionTitle: state.current_section_title, part: state.current_part, totalParts: state.total_parts, position: state.current_position } : null,
    outline: document?.structure_confidence === 'none' ? [] : outline.map((chapter) => ({ index: chapter.index, number: chapter.number, title: chapter.title,
      label: `${chapter.prefix} ${chapter.number ?? chapter.index}${chapter.title ? ` — ${chapter.title}` : ''}`, sections: chapter.sections.length })),
    pendingGeneration: generation ? { requestId: generation.request_id, status: generation.stale ? 'failed' : generation.status, retryable: generation.stale || generation.status === 'failed' || generation.status === 'cancelled',
      userMessageId: generation.user_message_id } : null,
  };
}
