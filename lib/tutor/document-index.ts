// Turns extracted pages into the outline plus chapter-aware chunks that are stored in knowledge_chunks.
// Pure: the same pages always give the same chunks, so a rebuild can reuse stored embeddings.
import { structureChunks, type StructuredChunk } from "./chunking";
import { analyzeDocument, SectionTracker, type DocumentOutline, type PageText } from "./structure";

export type IndexedChunk = StructuredChunk & {
  pageNumber: number | null;
  slideNumber: number | null;
  chapterIndex: number | null;
  chapterNumber: number | null;
  chapterTitle: string | null;
  sectionTitle: string | null;
  subsectionTitle: string | null;
};

export function buildDocumentIndex(pages: PageText[], options: { title: string; slides?: boolean }): { outline: DocumentOutline; chunks: IndexedChunk[] } {
  const { outline, segments } = analyzeDocument(pages, { title: options.title });
  const tracker = new SectionTracker();
  const chunks: IndexedChunk[] = [];
  for (const segment of segments) {
    for (const chunk of structureChunks(segment.text)) {
      const labels = tracker.next(segment.chapterIndex, segment.chapterNumber, chunk.content);
      chunks.push({
        ...chunk,
        // Legacy text columns keep their meaning; the new ones carry the structured values.
        chapter: segment.chapterTitle ?? chunk.chapter,
        section: labels.sectionTitle ?? chunk.section,
        pageNumber: segment.pageNumber,
        slideNumber: options.slides ? segment.pageNumber : null,
        chapterIndex: segment.chapterIndex,
        chapterNumber: segment.chapterNumber,
        chapterTitle: segment.chapterTitle,
        sectionTitle: labels.sectionTitle,
        subsectionTitle: labels.subsectionTitle,
      });
    }
  }
  return { outline, chunks };
}
