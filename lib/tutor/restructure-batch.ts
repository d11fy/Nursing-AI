import 'server-only';
import { workerDb } from './db';
import { rebuildDocumentStructure, type RebuildResult } from './restructure';
import { STRUCTURE_VERSION } from './structure';

export type RestructureStatus = 'updated' | 'unchanged' | 'skipped' | 'busy' | 'failed';
export interface RestructureResult {
  documentId: string;
  title: string;
  status: RestructureStatus;
  /** metadata = only labels changed (no embeddings); reindexed = chunks replaced, unchanged vectors reused. */
  mode?: 'metadata' | 'reindexed';
  reason?: string;
  error?: string;
  chapterCount?: number;
  sectionCount?: number;
  chunkCount?: number;
  embedded?: number;
  durationMs: number;
}
export interface RestructureOptions {
  documentId?: string | null;
  includePrivate?: boolean;
  /** Rebuild even when the stored structure is current (use with `skip` to resume). */
  force?: boolean;
  /** Documents read per page of the keyset scan. */
  batchSize?: number;
  /** Stop after this many documents have been attempted in this run. */
  limit?: number | null;
  /** Documents already done in an earlier run (from its journal). */
  skip?: ReadonlySet<string>;
  /** Stop (cleanly, between documents) after this many failures; otherwise failures never stop the run. */
  maxFailures?: number | null;
  shouldStop?: () => boolean;
  /** Called after EVERY document, success or failure; throwing here aborts the run (the journal could not be written). */
  onResult?: (result: RestructureResult) => void | Promise<void>;
  rebuild?: (documentId: string, options: { force?: boolean }) => Promise<RebuildResult>;
}
export interface RestructureSummary {
  attempted: number;
  updated: number;
  unchanged: number;
  skipped: number;
  busy: number;
  failed: number;
  embedded: number;
  stopped: 'completed' | 'signal' | 'max-failures' | 'limit';
}
/** Documents a previous run finished (updated or unchanged); header, summary and failed rows are ignored so failures are retried. */
export function parseJournal(text: string): Set<string> {
  const done = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    try {
      const row = JSON.parse(line) as { documentId?: string; status?: string };
      if (row.documentId && (row.status === 'updated' || row.status === 'unchanged')) done.add(row.documentId);
    } catch { /* a partially written last line is simply not counted */ }
  }
  return done;
}
type Candidate = { id: string; title: string; created_at: string };

const SELECT = `select id,title,created_at::text created_at from knowledge_documents
  where status='ready' and ($1::uuid is null or id=$1) and ($2 or owner_id is null) and ($3 or structure_version<$4)
    and ($5::timestamptz is null or (created_at,id) > ($5::timestamptz,$6::uuid))
  order by created_at,id limit $7`;

/** How many ready documents a run would visit (no limit/skip applied). */
export async function countRestructureCandidates(options: Pick<RestructureOptions, 'documentId' | 'includePrivate' | 'force'>): Promise<number> {
  return Number((await workerDb.query<{ n: string }>(`select count(*) n from knowledge_documents
    where status='ready' and ($1::uuid is null or id=$1) and ($2 or owner_id is null) and ($3 or structure_version<$4)`,
  [options.documentId ?? null, Boolean(options.includePrivate || options.documentId), Boolean(options.force), STRUCTURE_VERSION])).rows[0].n);
}

/**
 * Rebuilds book structure for existing documents.
 *  - idempotent: a current document is `unchanged`; chunk rows are replaced atomically, never added next to old ones,
 *    and stored vectors are reused, so a second run changes nothing and embeds nothing;
 *  - resumable: documents are visited in a stable (created_at, id) order and a failed one stays stale, so the next run
 *    picks up exactly the remainder (`skip` additionally honours a journal when `force` is used);
 *  - batch-safe: keyset pages, one document at a time, one advisory lock per document, graceful stop between documents;
 *  - isolated: a failure in one book is recorded and the run continues with the next.
 */
export async function runRestructure(options: RestructureOptions = {}): Promise<RestructureSummary> {
  const rebuild = options.rebuild ?? rebuildDocumentStructure;
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 25, 200));
  const summary: RestructureSummary = { attempted: 0, updated: 0, unchanged: 0, skipped: 0, busy: 0, failed: 0, embedded: 0, stopped: 'completed' };
  let cursor: { createdAt: string; id: string } | null = null;
  for (;;) {
    const page: Candidate[] = (await workerDb.query<Candidate>(SELECT, [options.documentId ?? null, Boolean(options.includePrivate || options.documentId),
      Boolean(options.force), STRUCTURE_VERSION, cursor?.createdAt ?? null, cursor?.id ?? null, batchSize])).rows;
    if (!page.length) return summary;
    for (const candidate of page) {
      cursor = { createdAt: candidate.created_at, id: candidate.id };
      if (options.skip?.has(candidate.id)) continue;
      if (options.shouldStop?.()) return { ...summary, stopped: 'signal' };
      if (options.limit != null && summary.attempted >= options.limit) return { ...summary, stopped: 'limit' };
      const started = Date.now();
      const result: RestructureResult = { documentId: candidate.id, title: candidate.title, status: 'failed', durationMs: 0 };
      try {
        const outcome = await rebuild(candidate.id, { force: options.force });
        if (outcome.status === 'skipped') Object.assign(result, { status: 'skipped', reason: outcome.reason });
        else if (outcome.status === 'unchanged') Object.assign(result, { status: 'unchanged', chapterCount: outcome.chapterCount });
        else Object.assign(result, { status: 'updated', mode: outcome.mode, chapterCount: outcome.chapterCount, sectionCount: outcome.sectionCount,
          chunkCount: outcome.chunkCount, embedded: outcome.embedded });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        // Another process (ingestion, a second run) holds the document: not a failure, it will be offered again.
        if (message === 'Document is already processing') Object.assign(result, { status: 'busy', reason: 'locked' });
        else Object.assign(result, { status: 'failed', error: message.slice(0, 300) });
      }
      result.durationMs = Date.now() - started;
      summary.attempted++;
      summary[result.status]++;
      summary.embedded += result.embedded ?? 0;
      await options.onResult?.(result);
      if (options.maxFailures != null && summary.failed >= options.maxFailures) return { ...summary, stopped: 'max-failures' };
    }
    if (page.length < batchSize) return summary;
  }
}
