// Structure-aware coverage for long study material.
//
// A long document is split into sections (pages grouped in order, cut at
// detected headings where possible). Each section is digested separately and
// the final summary is synthesized from all digests, so the end of a book is
// read with the same weight as the beginning. Coverage metadata records which
// sections and pages were processed.

export type Material = { pageNumber: number | null; text: string };

export interface SourceSection {
  index: number;
  heading: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  text: string;
}

export interface SourceCoverage {
  method: "direct" | "hierarchical";
  totalSections: number;
  processedSections: number;
  totalPages: number;
  firstPage: number | null;
  lastPage: number | null;
  sections: Array<{ index: number; heading: string | null; pages: string }>;
}

const HEADING = /^(?:#{1,4}\s+\S|(?:chapter|unit|section|part|lecture|module)\s+[\dIVX]+\b|\d+(?:\.\d+)*\s+[A-Z؀-ۿ]|[A-Z][A-Z0-9 ,&/()-]{5,80}$)/i;

/** First line that looks like a heading: markdown, "Chapter 3", "2.1 Title" or an ALL-CAPS line. */
export function detectHeading(text: string): string | null {
  for (const raw of text.split(/\r?\n/).slice(0, 6)) {
    const line = raw.trim();
    if (line.length >= 4 && line.length <= 90 && HEADING.test(line)) return line.replace(/^#+\s*/, "");
  }
  return null;
}

export function pageLabel(section: Pick<SourceSection, "pageStart" | "pageEnd">) {
  if (section.pageStart == null) return "Section";
  return section.pageEnd != null && section.pageEnd !== section.pageStart
    ? `Pages ${section.pageStart}-${section.pageEnd}` : `Page ${section.pageStart}`;
}

/**
 * Groups consecutive pages into sections of roughly `targetChars`, starting a
 * new section at a detected heading once the current one is at least half
 * full. A single oversized page is split into several sections.
 */
export function planSections(materials: Material[], targetChars = 16000): SourceSection[] {
  const sections: SourceSection[] = [];
  let current: SourceSection | null = null;
  const close = () => { if (current && current.text.trim()) sections.push(current); current = null; };
  for (const material of materials) {
    const text = material.text.trim();
    if (!text) continue;
    const heading = detectHeading(text);
    const pieces: string[] = [];
    for (let offset = 0; offset < text.length; offset += targetChars) pieces.push(text.slice(offset, offset + targetChars));
    pieces.forEach((piece, pieceIndex) => {
      const startsChapter = pieceIndex === 0 && heading !== null;
      if (current && (current.text.length + piece.length > targetChars || (startsChapter && current.text.length > targetChars / 2))) close();
      if (!current) current = { index: sections.length, heading: pieceIndex === 0 ? heading : null, pageStart: material.pageNumber, pageEnd: material.pageNumber, text: "" };
      current.heading ??= pieceIndex === 0 ? heading : null;
      current.pageEnd = material.pageNumber ?? current.pageEnd;
      const label = material.pageNumber != null ? `[Page / Slide ${material.pageNumber}]` : "[Section]";
      current.text += `${current.text ? "\n\n" : ""}${label}\n${piece}`;
    });
  }
  close();
  return sections.map((section, index) => ({ ...section, index }));
}

export function describeCoverage(method: SourceCoverage["method"], sections: SourceSection[], processed: number): SourceCoverage {
  const pages = sections.flatMap((section) => [section.pageStart, section.pageEnd]).filter((page): page is number => page != null);
  return {
    method,
    totalSections: sections.length,
    processedSections: processed,
    totalPages: pages.length ? Math.max(...pages) - Math.min(...pages) + 1 : 0,
    firstPage: pages.length ? Math.min(...pages) : null,
    lastPage: pages.length ? Math.max(...pages) : null,
    sections: sections.map((section) => ({ index: section.index, heading: section.heading, pages: pageLabel(section) })),
  };
}

/**
 * Bounded excerpt for single-call generators (flashcards, quizzes). Unlike a
 * prefix cut, every section gets an equal share of the budget, so material
 * from the last section is always present.
 */
export function evenExcerpt(materials: Material[], maxChars: number): string {
  const full = materials.filter((m) => m.text.trim()).map((m) => `[${m.pageNumber ? `Page / Slide ${m.pageNumber}` : "Section"}]\n${m.text.trim()}`).join("\n\n");
  if (full.length <= maxChars) return full;
  const all = planSections(materials, Math.max(2000, Math.floor(maxChars / 8)));
  // Too many sections for a useful share each: sample evenly, always keeping
  // the first and the last section.
  const MIN_SHARE = 400, SEPARATOR = 40;
  const room = Math.max(2, Math.floor(maxChars / (MIN_SHARE + SEPARATOR)));
  const sections = all.length <= room ? all
    : Array.from({ length: room }, (_, i) => all[Math.round((i * (all.length - 1)) / (room - 1))]);
  const share = Math.floor(maxChars / sections.length) - SEPARATOR;
  return sections.map((section) => section.text.length > share ? `${section.text.slice(0, share - 16)}\n...[continued]` : section.text)
    .join("\n\n");
}

/** Runs `worker` over items with at most `limit` in flight, preserving order. */
export async function mapLimited<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

/** Student-facing statement of what the summary read; never claims more than was processed. */
export function coverageLabel(coverage: SourceCoverage | undefined | null): string {
  if (!coverage) return "مبني من ملف المحاضرة";
  const pages = coverage.firstPage != null && coverage.lastPage != null
    ? `، الصفحات ${coverage.firstPage}–${coverage.lastPage}` : "";
  if (coverage.processedSections < coverage.totalSections)
    return `شمل ${coverage.processedSections} من ${coverage.totalSections} أقسام${pages}`;
  return `شمل كل أقسام الملف (${coverage.totalSections}${pages})`;
}
