// Chapter coverage planning. A chapter is split into ordered PARTS; each part is a
// bounded set of consecutive passages (the model receives at most 10 evidence items).
// Pure: it works on chunk metadata, so it is cheap and exactly reproducible between turns.

export type ChunkMeta = {
  id: string;
  chunkIndex: number;
  tokenCount: number;
  pageNumber: number | null;
  sectionTitle: string | null;
  subsectionTitle: string | null;
};
export type PlanItem = { chunks: ChunkMeta[]; tokens: number; firstChunkIndex: number; lastChunkIndex: number };
export type PlanPart = {
  index: number; // 1-based
  items: PlanItem[];
  tokens: number;
  firstChunkIndex: number;
  lastChunkIndex: number;
  pageStart: number | null;
  pageEnd: number | null;
  sections: string[];
};
export type ChapterPlan = { parts: PlanPart[]; totalChunks: number; totalTokens: number };

/** One evidence item groups consecutive chunks up to this size; a part holds at most MAX_ITEMS items. */
export const ITEM_TOKENS = 1500;
export const MAX_ITEMS = 10;

export function planChapter(chunks: ChunkMeta[], limits: { itemTokens?: number; maxItems?: number } = {}): ChapterPlan {
  const itemTokens = limits.itemTokens ?? ITEM_TOKENS, maxItems = limits.maxItems ?? MAX_ITEMS;
  const ordered = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  const items: PlanItem[] = [];
  for (const chunk of ordered) {
    const last = items[items.length - 1];
    if (last && last.tokens + chunk.tokenCount <= itemTokens) {
      last.chunks.push(chunk); last.tokens += chunk.tokenCount; last.lastChunkIndex = chunk.chunkIndex;
    } else items.push({ chunks: [chunk], tokens: chunk.tokenCount, firstChunkIndex: chunk.chunkIndex, lastChunkIndex: chunk.chunkIndex });
  }
  const parts: PlanPart[] = [];
  for (let i = 0; i < items.length; i += maxItems) {
    const slice = items.slice(i, i + maxItems);
    const all = slice.flatMap((item) => item.chunks);
    const pages = all.map((chunk) => chunk.pageNumber).filter((page): page is number => page !== null);
    parts.push({
      index: parts.length + 1, items: slice, tokens: slice.reduce((sum, item) => sum + item.tokens, 0),
      firstChunkIndex: slice[0].firstChunkIndex, lastChunkIndex: slice[slice.length - 1].lastChunkIndex,
      pageStart: pages.length ? Math.min(...pages) : null, pageEnd: pages.length ? Math.max(...pages) : null,
      sections: [...new Set(all.flatMap((chunk) => [chunk.sectionTitle, chunk.subsectionTitle]).filter((title): title is string => Boolean(title)))],
    });
  }
  return { parts, totalChunks: ordered.length, totalTokens: ordered.reduce((sum, chunk) => sum + chunk.tokenCount, 0) };
}

/** The part that contains (or, past a gap, follows) a chunk position. */
export function partAtPosition(plan: ChapterPlan, position: number | null): number | null {
  if (position === null || !plan.parts.length) return null;
  const found = plan.parts.find((part) => position >= part.firstChunkIndex && position <= part.lastChunkIndex);
  if (found) return found.index;
  const next = plan.parts.find((part) => part.firstChunkIndex > position);
  return next ? next.index : plan.parts[plan.parts.length - 1].index;
}

/** Evenly spaced items (always including the first and the last) for overviews and quizzes. */
export function sampleItems(plan: ChapterPlan, count = MAX_ITEMS, upToChunkIndex: number | null = null): PlanItem[] {
  const items = plan.parts.flatMap((part) => part.items).filter((item) => upToChunkIndex === null || item.firstChunkIndex <= upToChunkIndex);
  if (items.length <= count) return items;
  return Array.from({ length: count }, (_, i) => items[Math.round((i * (items.length - 1)) / (count - 1))]);
}

export type StudyState = {
  documentId: string;
  chapterIndex: number | null;
  chapterNumber: number | null;
  chapterTitle: string | null;
  sectionTitle: string | null;
  part: number | null;
  totalParts: number | null;
  /** chunk_index of the last passage the student has been taught in this chapter. */
  position: number | null;
  mode: string | null;
};

/** Which part to teach next for a navigation command inside the current chapter. */
export type NavigationStep = { kind: "parts"; part: number } | { kind: "reply"; total: number } | { kind: "next-chapter" };
export function planNavigation(command: "continue" | "back" | "part", plan: ChapterPlan, state: Pick<StudyState, "position" | "part">, requestedPart?: number): NavigationStep {
  const total = plan.parts.length;
  const current = partAtPosition(plan, state.position) ?? state.part ?? 0;
  if (command === "part") {
    if (!requestedPart || requestedPart < 1 || requestedPart > total) return { kind: "reply", total };
    return { kind: "parts", part: requestedPart };
  }
  if (command === "back") return { kind: "parts", part: Math.max(1, current - 1) };
  if (current >= total) return { kind: "next-chapter" };
  return { kind: "parts", part: current + 1 };
}
