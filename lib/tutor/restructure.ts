import 'server-only';
import { workerDb, withIdentity } from './db';
import { buildDocumentIndex } from './document-index';
import { STRUCTURE_VERSION, type DocumentOutline } from './structure';
import { publishIndex, withDocumentLock, type IndexedDocument } from './ingestion';
import { logEvent } from '@/lib/log';

export type RebuildResult =
  | { status: 'skipped'; reason: 'not_found' | 'not_ready' | 'no_extracted_pages' }
  | { status: 'unchanged'; chapterCount: number }
  | { status: 'updated'; mode: 'metadata' | 'reindexed'; chapterCount: number; sectionCount: number; chunkCount: number; embedded: number };

/**
 * Re-detects chapters, sections and chunk labels for an existing book.
 *  - If the chunk texts are identical to the stored ones only the metadata columns change (no embeddings).
 *  - Otherwise the chunks are replaced atomically, reusing every stored vector whose text is unchanged.
 * The document stays 'ready' throughout and is never duplicated.
 */
export async function rebuildDocumentStructure(documentId: string, options: { force?: boolean } = {}): Promise<RebuildResult> {
  return withDocumentLock(documentId, async () => {
    const doc = (await workerDb.query<IndexedDocument & { structure_version: number }>('select * from knowledge_documents where id=$1', [documentId])).rows[0];
    if (!doc) return { status: 'skipped', reason: 'not_found' } as const;
    if (doc.status !== 'ready') return { status: 'skipped', reason: 'not_ready' } as const;
    if (!options.force && doc.structure_version >= STRUCTURE_VERSION) {
      const stored = (await workerDb.query<{ chapter_count: number }>('select chapter_count from knowledge_documents where id=$1', [documentId])).rows[0];
      return { status: 'unchanged', chapterCount: stored?.chapter_count ?? 0 } as const;
    }
    const pages = doc.extracted_pages_json;
    if (!pages?.length) return { status: 'skipped', reason: 'no_extracted_pages' } as const;
    const start = Date.now();
    const { outline, chunks } = buildDocumentIndex(pages, { title: doc.title, slides: /\.pptx$/i.test(doc.original_file_name) });
    const stored = (await workerDb.query<{ chunk_index: number; content_hash: string }>('select chunk_index,content_hash from knowledge_chunks where document_id=$1 order by chunk_index', [documentId])).rows;
    const identical = stored.length === chunks.length && stored.every((row, i) => Number(row.chunk_index) === i && row.content_hash === chunks[i].contentHash);
    if (identical) {
      await withIdentity(null, async (db) => {
        await db.query(`update knowledge_chunks k set chapter=v.chapter,section=v.section,chapter_index=v.chapter_index,chapter_number=v.chapter_number,
          chapter_title=v.chapter_title,section_title=v.section_title,subsection_title=v.subsection_title,slide_number=v.slide_number
          from jsonb_to_recordset($2::jsonb) as v(chunk_index int,chapter text,section text,chapter_index int,chapter_number int,chapter_title text,
            section_title text,subsection_title text,slide_number int) where k.document_id=$1 and k.chunk_index=v.chunk_index`,
        [documentId, JSON.stringify(chunks.map((c, i) => ({ chunk_index: i, chapter: c.chapter, section: c.section, chapter_index: c.chapterIndex,
          chapter_number: c.chapterNumber, chapter_title: c.chapterTitle, section_title: c.sectionTitle, subsection_title: c.subsectionTitle, slide_number: c.slideNumber })))]);
        await storeOutline(db, documentId, outline);
      }, true);
      logEvent('STRUCTURE_REBUILT', { documentId, processingStatus: 'ready', mode: 'metadata', chapterCount: outline.chapterCount, sectionCount: outline.sectionCount,
        chunkCount: chunks.length, embedded: 0, confidence: outline.confidence, method: outline.method });
      return { status: 'updated', mode: 'metadata', chapterCount: outline.chapterCount, sectionCount: outline.sectionCount, chunkCount: chunks.length, embedded: 0 } as const;
    }
    // Boundaries moved (chapter starts mid-page): keep every vector whose chunk text survived.
    const reuse = new Map<string, string>();
    const vectors = (await workerDb.query<{ content_hash: string; embedding: string }>('select content_hash,embedding::text from knowledge_chunks where document_id=$1', [documentId])).rows;
    for (const row of vectors) reuse.set(row.content_hash, row.embedding);
    const published = await publishIndex(doc, pages, doc.file_hash, { mode: 'rebuild', start, reuse });
    return { status: 'updated', mode: 'reindexed', ...published } as const;
  });
}

async function storeOutline(db: import('pg').PoolClient, documentId: string, outline: DocumentOutline) {
  await db.query(`update knowledge_documents set outline_json=$2::jsonb,structure_version=$3,structure_confidence=$4,structure_method=$5,
    chapter_count=$6,section_count=$7,updated_at=now() where id=$1`,
  [documentId, JSON.stringify(outline), STRUCTURE_VERSION, outline.confidence, outline.method, outline.chapterCount, outline.sectionCount]);
}

/** Rebuilds a stale book on demand. Returns quietly when another process is already doing it. */
export async function ensureDocumentStructure(documentId: string): Promise<void> {
  const row = (await workerDb.query<{ status: string; structure_version: number }>('select status,structure_version from knowledge_documents where id=$1', [documentId])).rows[0];
  if (!row || row.status !== 'ready' || row.structure_version >= STRUCTURE_VERSION) return;
  try { await rebuildDocumentStructure(documentId); }
  catch (error) {
    if (error instanceof Error && error.message === 'Document is already processing') return;
    throw error;
  }
}
