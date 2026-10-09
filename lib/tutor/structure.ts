// Document structure detection: BOOK -> CHAPTERS -> SECTIONS -> SUBSECTIONS.
//
// Pure and deterministic (no database, no AI) so the same pages always give the
// same outline and the same chunk metadata. Detection order:
//   1. explicit headings ("Chapter 4", "CHAPTER IV", "الفصل الرابع", "Unit 4")
//      checked for monotonic numbering, so running headers and cross references
//      do not create phantom chapters;
//   2. the table of contents, used to confirm the order or to locate chapters
//      whose heading carries no number, never trusting printed page numbers;
//   3. markdown / numbered headings, where chapters are numbered by order of
//      appearance (confidence "medium").
// When none of these produce a trustworthy outline the result is "none" and the
// caller must not guess a chapter.
import { normalizeForMatch, parseNumberAt, tokenize } from "./numbering";

export const STRUCTURE_VERSION = 1;

export type PageText = { pageNumber: number | null; text: string; ocr?: boolean };
export type Confidence = "high" | "medium" | "low";
export type ChapterPrefix = "Chapter" | "Unit" | "Module" | "الفصل" | "الوحدة" | "الباب";

export interface OutlineSection {
  index: number;
  number: string | null;
  title: string;
  level: 2 | 3;
  pageStart: number | null;
  pageEnd: number | null;
}
export interface OutlineChapter {
  /** 1-based order of appearance. */
  index: number;
  /** Number printed in the book; null when the chapters are only ordered. */
  number: number | null;
  title: string;
  prefix: ChapterPrefix;
  pageStart: number | null;
  pageEnd: number | null;
  confidence: Confidence;
  source: "heading" | "toc" | "markdown" | "numbered";
  sections: OutlineSection[];
}
export interface DocumentOutline {
  version: number;
  bookTitle: string;
  confidence: Confidence | "none";
  method: "keyword" | "toc" | "markdown" | "numbered" | "none";
  tocDetected: boolean;
  /** Chapters the table of contents lists but whose heading was not found in the body. */
  tocOnly: Array<{ number: number | null; title: string }>;
  warnings: string[];
  chapterCount: number;
  sectionCount: number;
  chapters: OutlineChapter[];
}
export interface Segment {
  pageNumber: number | null;
  text: string;
  chapterIndex: number | null;
  chapterNumber: number | null;
  chapterTitle: string | null;
  sectionTitle: string | null;
  subsectionTitle: string | null;
}
export const emptyOutline = (bookTitle: string, warnings: string[] = []): DocumentOutline => ({
  version: STRUCTURE_VERSION, bookTitle, confidence: "none", method: "none", tocDetected: false, tocOnly: [], warnings,
  chapterCount: 0, sectionCount: 0, chapters: [],
});

export function chapterLabel(chapter: Pick<OutlineChapter, "number" | "index" | "title" | "prefix">): string {
  const head = `${chapter.prefix} ${chapter.number ?? chapter.index}`;
  return chapter.title ? `${head} — ${chapter.title}` : head;
}

// ---------------------------------------------------------------------------
// Heading recognition

const KEYWORDS: Record<string, ChapterPrefix> = {
  chapter: "Chapter", chap: "Chapter", ch: "Chapter", unit: "Unit", module: "Module",
  فصل: "الفصل", الفصل: "الفصل", شابتر: "الفصل", الشابتر: "الفصل", وحده: "الوحدة", الوحده: "الوحدة", باب: "الباب", الباب: "الباب",
};
const PROSE_START = /^(?:is|are|was|were|has|have|had|will|would|can|could|should|may|might|discusses?|describes?|covers?|explains?|introduces?|presents?|shows?|provides?|focuses|deals|examines|and|or|but|of|in|on|for|to|with|that|which|where|when|also)\b/;

type HeadingMatch = { number: number | null; title: string; prefix: ChapterPrefix; keywordOnly: boolean; width: number };

const stripDecor = (line: string) => line.replace(/^\s*#{1,6}\s+/, "").replace(/^\s*(?:\*\*|__)/, "").replace(/(?:\*\*|__)\s*$/, "").trim();

/** Matches "Chapter 4: Title", "CHAPTER IV - Title", "الفصل الرابع: العنوان", "Unit 4", "Ch. 4". */
export function matchChapterLine(raw: string): HeadingMatch | null {
  const line = stripDecor(raw.normalize("NFKC").replace(/[​-‏‪-‮﻿]/g, ""));
  if (line.length < 3 || line.length > 140) return null;
  const keyword = line.match(/^(\p{L}+)\.?(?=[\s:.\-–—#\d]|$)\s*(.*)$/u);
  if (!keyword) return null;
  const prefix = KEYWORDS[normalizeForMatch(keyword[1])];
  if (!prefix) return null;
  const rest = keyword[2].replace(/^(?:no\.?|number|#|№|رقم)\s*/i, "").trim();
  if (!rest) return { number: null, title: "", prefix, keywordOnly: true, width: 1 };
  const tokens = [...rest.matchAll(/[\p{L}\p{N}]+/gu)];
  if (!tokens.length || (tokens[0].index ?? 0) > 3) return null;
  const normalized = tokens.slice(0, 3).map((token) => normalizeForMatch(token[0]));
  // Roman numerals are only accepted when written in capitals ("Chapter IV").
  const romanOk = tokens[0][0] === tokens[0][0].toUpperCase();
  const parsed = parseNumberAt(normalized, 0, { allowRoman: romanOk });
  if (!parsed) return null;
  const last = tokens[parsed.consumed - 1];
  const end = (last.index ?? 0) + last[0].length;
  // "Chapter 4.2" is a section reference, not a chapter heading.
  if (/^\.\d/.test(rest.slice(end))) return null;
  let title = rest.slice(end).replace(/^[\s:.\-–—)|•·]+/, "").trim();
  if (title.includes("|")) title = title.split("|").map((part) => part.trim()).find(Boolean) ?? "";
  title = title.replace(/\s*[.·…]{2,}.*$/, "").trim();
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length > 16) return null;
  if (/^\p{Ll}/u.test(title) && /^[a-z]/.test(title) && PROSE_START.test(title)) return null;
  if (words.length > 8 && /[.!?؟]$/.test(title)) return null;
  return { number: parsed.value, title, prefix, keywordOnly: false, width: 1 };
}

/** Section headings: markdown "##" and numbered "4.1 Title" / "4.1.2 Title" belonging to the chapter number. */
export function matchSectionLine(raw: string, chapterNumber: number | null): { level: 2 | 3; number: string | null; title: string } | null {
  const line = raw.trim();
  if (line.length < 3 || line.length > 140) return null;
  const markdown = line.match(/^(#{2,4})\s+(.+?)\s*#*$/);
  if (markdown) return { level: markdown[1].length >= 3 ? 3 : 2, number: null, title: markdown[2].trim() };
  const numbered = line.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{1,2}))?[.)]?\s+(\S.*)$/);
  if (!numbered) return null;
  if (chapterNumber !== null && Number(numbered[1]) !== chapterNumber) return null;
  const title = numbered[4].trim();
  const words = title.split(/\s+/);
  if (words.length > 14 || title.length < 2) return null;
  if (/^[a-z]/.test(title) || /^\d+(?:\.\d+)?\s*(?:mg|mcg|ml|kg|g|%|mmhg|l|cm|mm)\b/i.test(title)) return null;
  if (/[.!?؟]\s+\S/.test(title)) return null;
  return { level: numbered[3] ? 3 : 2, number: numbered[3] ? `${numbered[1]}.${numbered[2]}.${numbered[3]}` : `${numbered[1]}.${numbered[2]}`, title: title.replace(/[.:]+$/, "") };
}

// ---------------------------------------------------------------------------
// Table of contents

type TocEntry = { number: number | null; title: string; keyword: boolean; decimal: boolean; line: number };
const TOC_HEADER = /^(?:table of contents|contents|المحتويات|الفهرس|فهرس المحتويات|فهرس)$/;
const TOC_LEADER = /^(.*?\S)\s*(?:\.{2,}[\s.]*|(?:\.\s){2,}\.?\s*|…+\s*|·{2,}\s*|\t+\s*|\s{3,})(\d{1,4}|[ivxlc]{1,6})\s*$/i;

function parseTocLine(raw: string): Omit<TocEntry, "line"> | null {
  const text = raw.replace(/ /g, " ").trimEnd();
  if (text.length < 5 || text.length > 170) return null;
  let head = TOC_LEADER.exec(text)?.[1];
  if (!head) {
    // No leader: accept only "Chapter N Title 45" shaped lines.
    const trailing = text.match(/^(.*\S)\s+(\d{1,4})$/);
    if (!trailing || !matchChapterLine(trailing[1])) return null;
    head = trailing[1];
  }
  const chapter = matchChapterLine(head);
  if (chapter && !chapter.keywordOnly && chapter.number !== null) return { number: chapter.number, title: chapter.title, keyword: true, decimal: false };
  const numbered = head.match(/^(\d{1,2})((?:\.\d+)*)[.)]?\s+(\S.*)$/);
  if (numbered) return { number: Number(numbered[1]), title: numbered[3].trim(), keyword: false, decimal: Boolean(numbered[2]) };
  return { number: null, title: head.trim(), keyword: false, decimal: false };
}

function detectToc(lines: string[]): { ranges: Array<[number, number]>; entries: TocEntry[] } {
  const limit = Math.max(600, Math.floor(lines.length * 0.35));
  const flagged: Array<{ line: number; entry: Omit<TocEntry, "line"> }> = [];
  for (let i = 0; i < Math.min(lines.length, limit); i++) {
    const entry = parseTocLine(lines[i]);
    if (entry) flagged.push({ line: i, entry });
  }
  const ranges: Array<[number, number]> = [];
  const entries: TocEntry[] = [];
  let run: typeof flagged = [];
  const nonBlankBetween = (from: number, to: number) => lines.slice(from + 1, to).filter((line) => line.trim()).length;
  const close = () => {
    if (run.length >= 4) {
      let start = run[0].line;
      for (let back = start - 1; back >= Math.max(0, start - 4); back--) {
        if (TOC_HEADER.test(normalizeForMatch(lines[back]).replace(/[^\p{L} ]/gu, "").trim())) { start = back; break; }
      }
      ranges.push([start, run[run.length - 1].line]);
      for (const item of run) entries.push({ ...item.entry, line: item.line });
    }
    run = [];
  };
  for (const item of flagged) {
    if (run.length && nonBlankBetween(run[run.length - 1].line, item.line) > 3) close();
    run.push(item);
  }
  close();
  return { ranges, entries };
}

// ---------------------------------------------------------------------------
// Candidate collection and monotonic chain selection

type Candidate = { start: number; end: number; number: number | null; title: string; prefix: ChapterPrefix };

function collectKeywordCandidates(lines: string[], excluded: (g: number) => boolean): Candidate[] {
  const found: Candidate[] = [];
  for (let g = 0; g < lines.length; g++) {
    if (excluded(g) || !lines[g].trim()) continue;
    const match = matchChapterLine(lines[g]);
    if (!match) continue;
    if (!match.keywordOnly) { found.push({ start: g, end: g, number: match.number, title: match.title, prefix: match.prefix }); continue; }
    // "CHAPTER" / "4" / "The Skeletal System" printed on separate lines.
    let next = g + 1;
    while (next < lines.length && !lines[next].trim()) next++;
    const numberLine = lines[next]?.trim() ?? "";
    const tokens = tokenize(numberLine);
    const parsed = numberLine.length <= 12 ? parseNumberAt(tokens, 0, { allowRoman: numberLine === numberLine.toUpperCase() }) : null;
    if (!parsed || parsed.consumed !== tokens.length) continue;
    let titleAt = next + 1;
    while (titleAt < lines.length && !lines[titleAt].trim()) titleAt++;
    const title = lines[titleAt]?.trim() ?? "";
    const usable = title.length > 0 && title.length <= 100 && !matchChapterLine(title) && titleAt - next <= 3;
    found.push({ start: g, end: usable ? titleAt : next, number: parsed.value, title: usable ? title : "", prefix: matchChapterLine(lines[g])!.prefix });
    g = usable ? titleAt : next;
  }
  return found;
}

/** Longest strictly increasing numbering; earliest occurrence wins, so repeated running headers collapse. */
function monotonicChain(candidates: Candidate[]): Candidate[] {
  const numbered = candidates.filter((candidate) => candidate.number !== null);
  const length: number[] = new Array(numbered.length).fill(1);
  const previous: number[] = new Array(numbered.length).fill(-1);
  for (let i = 0; i < numbered.length; i++) {
    for (let j = 0; j < i; j++) {
      const gap = numbered[i].number! - numbered[j].number!;
      if (gap >= 1 && gap <= 25 && length[j] + 1 > length[i]) { length[i] = length[j] + 1; previous[i] = j; }
    }
  }
  let tail = -1;
  for (let i = 0; i < numbered.length; i++) if (tail < 0 || length[i] > length[tail]) tail = i;
  const chain: Candidate[] = [];
  for (let at = tail; at >= 0; at = previous[at]) chain.unshift(numbered[at]);
  return chain;
}

/** Lists of chapter names (preface summaries, TOC without page numbers) have no body text between entries. */
function dropListClusters(candidates: Candidate[], lines: string[]): { kept: Candidate[]; dropped: Candidate[] } {
  const nonBlankBetween = (a: Candidate, b: Candidate) => lines.slice(a.end + 1, b.start).filter((line) => line.trim()).length;
  const isList = new Array(candidates.length).fill(false);
  let runStart = 0;
  for (let i = 1; i <= candidates.length; i++) {
    const continues = i < candidates.length && nonBlankBetween(candidates[i - 1], candidates[i]) === 0;
    if (continues) continue;
    if (i - runStart >= 3) for (let k = runStart; k < i; k++) isList[k] = true;
    runStart = i;
  }
  return { kept: candidates.filter((_, i) => !isList[i]), dropped: candidates.filter((_, i) => isList[i]) };
}

type Boundary = { start: number; end: number; number: number | null; title: string; prefix: ChapterPrefix; source: OutlineChapter["source"]; confidence: Confidence };

const END_MATTER = /^(?:appendix(?:es)?|glossary|index|bibliography|references|answers?\s+(?:key|to\b)|المراجع|الملاحق|الملحق|المسرد|فهرس)\b/;

export function analyzeDocument(pages: PageText[], options: { title: string }): { outline: DocumentOutline; segments: Segment[] } {
  const lines: string[] = [], pageOfLine: number[] = [];
  pages.forEach((page, pageIndex) => {
    for (const line of page.text.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").split("\n")) { lines.push(line); pageOfLine.push(pageIndex); }
  });
  const warnings: string[] = [];
  const toc = detectToc(lines);
  const inToc = (g: number) => toc.ranges.some(([start, end]) => g >= start && g <= end);
  const tocChapters = (() => {
    const keyworded = toc.entries.filter((entry) => entry.keyword && entry.number !== null);
    const source = keyworded.length ? keyworded : toc.entries.filter((entry) => entry.number !== null && !entry.decimal);
    return [...new Map(source.map((entry) => [entry.number, entry])).values()];
  })();

  let boundaries: Boundary[] = [];
  let method: DocumentOutline["method"] = "none";
  let tocOnly: DocumentOutline["tocOnly"] = [];

  const candidateList = collectKeywordCandidates(lines, inToc);
  const { kept, dropped } = dropListClusters(candidateList, lines);
  const chain = monotonicChain(kept);
  if (dropped.length) warnings.push(`تجاهلنا ${dropped.length} سطر يشبه قائمة فصول (فهرس بلا أرقام صفحات) حتى لا تُعتبر فصولًا`);

  const locateByTitle = (entry: TocEntry, from: number, to: number): number | null => {
    const wanted = normalizeForMatch(entry.title).replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
    if (wanted.length < 3) return null;
    for (let g = from; g < to; g++) {
      if (inToc(g) || !lines[g].trim() || lines[g].length > 160) continue;
      const have = normalizeForMatch(lines[g]).replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
      if (have === wanted || have === `${entry.number} ${wanted}`) return g;
    }
    return null;
  };

  if (chain.length >= 2) {
    method = "keyword";
    boundaries = chain.map((item) => ({ start: item.start, end: item.end, number: item.number, title: item.title, prefix: item.prefix, source: "heading" as const, confidence: "high" as const }));
    // Chapters the table of contents lists but the headings missed are located by title between their neighbours.
    const have = new Set(boundaries.map((item) => item.number));
    for (const entry of tocChapters) {
      if (have.has(entry.number)) continue;
      const before = [...boundaries].reverse().find((item) => item.number !== null && item.number < entry.number!);
      const after = boundaries.find((item) => item.number !== null && item.number > entry.number!);
      const at = locateByTitle(entry, before ? before.end + 1 : 0, after ? after.start : lines.length);
      if (at === null) continue;
      boundaries.push({ start: at, end: at, number: entry.number, title: entry.title, prefix: boundaries[0].prefix, source: "toc", confidence: "medium" });
      have.add(entry.number);
    }
    boundaries.sort((a, b) => a.start - b.start);
    // Fall back to the table of contents title when the heading line carried none.
    for (const item of boundaries) if (!item.title) item.title = tocChapters.find((entry) => entry.number === item.number)?.title ?? "";
  } else if (tocChapters.length >= 2) {
    method = "toc";
    let cursor = 0;
    for (const entry of [...tocChapters].sort((a, b) => a.number! - b.number!)) {
      const at = locateByTitle(entry, cursor, lines.length);
      if (at === null) continue;
      boundaries.push({ start: at, end: at, number: entry.number, title: entry.title, prefix: "Chapter", source: "toc", confidence: "medium" });
      cursor = at + 1;
    }
    if (boundaries.length < 2) boundaries = [];
  }
  if (boundaries.length < 2) {
    const markdown = markdownChapters(lines);
    if (markdown.length >= 2) { method = "markdown"; boundaries = markdown; }
    else {
      const numbered = numberedChapters(lines, inToc);
      if (numbered.length >= 3) { method = "numbered"; boundaries = numbered; }
    }
  }
  if (boundaries.length === 1 && chain.length === 1) {
    method = "keyword";
    boundaries = [{ start: chain[0].start, end: chain[0].end, number: chain[0].number, title: chain[0].title, prefix: chain[0].prefix, source: "heading", confidence: "low" }];
  }

  // Chapters end where the back matter (appendix, glossary, index...) begins.
  let backMatterAt: number | null = null;
  if (boundaries.length >= 2) {
    const lastStart = boundaries[boundaries.length - 1].end;
    for (let g = lastStart + 1; g < lines.length; g++) {
      const text = lines[g].trim();
      if (!text || text.length > 60 || !END_MATTER.test(normalizeForMatch(text))) continue;
      // Back matter starts at the top of a page (within its first few non-empty lines).
      let above = 0;
      for (let k = g - 1; k >= 0 && pageOfLine[k] === pageOfLine[g]; k--) if (lines[k].trim()) above++;
      const charsSinceChapter = lines.slice(lastStart, g).join("\n").length;
      if (above <= 2 && charsSinceChapter > 1500) { backMatterAt = g; break; }
    }
  }

  const pageNumberAt = (g: number) => (g >= 0 && g < lines.length ? pages[pageOfLine[g]].pageNumber : null);
  const sectionsOf: OutlineSection[][] = boundaries.map(() => []);
  const chapters: OutlineChapter[] = boundaries.map((item, i) => {
    const endExclusive = i + 1 < boundaries.length ? boundaries[i + 1].start : backMatterAt ?? lines.length;
    for (let g = item.end + 1; g < endExclusive; g++) {
      const section = matchSectionLine(lines[g], item.number);
      if (!section) continue;
      const list = sectionsOf[i], previous = list[list.length - 1];
      if (previous) previous.pageEnd = pageNumberAt(g);
      list.push({ index: list.length + 1, number: section.number, title: section.title, level: section.level, pageStart: pageNumberAt(g), pageEnd: pageNumberAt(endExclusive - 1) });
    }
    return {
      index: i + 1, number: item.number, title: item.title, prefix: item.prefix, pageStart: pageNumberAt(item.start),
      pageEnd: pageNumberAt(endExclusive - 1), confidence: item.confidence, source: item.source, sections: sectionsOf[i],
    };
  });

  // Confidence: strongest signal wins; any doubt lowers it (callers refuse to guess on "low").
  const numbers = chapters.map((chapter) => chapter.number).filter((value): value is number => value !== null);
  const consecutive = numbers.length === chapters.length && numbers.every((value, i) => i === 0 || value === numbers[i - 1] + 1);
  const tocNumbers = new Set(tocChapters.map((entry) => entry.number));
  const tocCoverage = tocChapters.length ? numbers.filter((value) => tocNumbers.has(value)).length / tocChapters.length : null;
  tocOnly = tocChapters.filter((entry) => !numbers.includes(entry.number!)).map((entry) => ({ number: entry.number, title: entry.title }));
  let confidence: DocumentOutline["confidence"] = "none";
  if (chapters.length >= 2) {
    if (method === "keyword") confidence = consecutive && (tocCoverage === null || tocCoverage >= 0.8) ? "high" : tocCoverage !== null && tocCoverage < 0.5 ? "low" : "medium";
    else if (method === "toc") confidence = tocCoverage !== null && tocCoverage >= 0.8 ? "high" : "medium";
    else confidence = "medium";
    if (method === "keyword" && tocCoverage !== null && tocCoverage >= 0.8 && consecutive) confidence = "high";
    if (!consecutive && method === "keyword" && numbers.length === chapters.length) warnings.push("ترقيم الفصول غير متسلسل؛ قد تكون بعض الفصول مفقودة");
  } else if (chapters.length === 1) confidence = "low";
  if (tocOnly.length) warnings.push(`الفهرس يذكر ${tocOnly.length} فصل لم يُعثر على عنوانه داخل الكتاب`);
  for (const chapter of chapters) if (confidence === "low") chapter.confidence = "low"; else if (chapter.confidence === "high" && confidence === "medium") chapter.confidence = "medium";

  const outline: DocumentOutline = {
    version: STRUCTURE_VERSION, bookTitle: options.title, confidence, method: chapters.length ? method : "none",
    tocDetected: toc.ranges.length > 0, tocOnly, warnings, chapterCount: chapters.length,
    sectionCount: chapters.reduce((sum, chapter) => sum + chapter.sections.length, 0), chapters,
  };
  return { outline, segments: buildSegments(pages, lines, pageOfLine, boundaries, backMatterAt, chapters) };
}

function markdownChapters(lines: string[]): Boundary[] {
  const byLevel = new Map<number, number[]>();
  lines.forEach((line, g) => {
    const match = line.match(/^(#{1,2})\s+(\S.*?)\s*#*$/);
    if (match) byLevel.set(match[1].length, [...(byLevel.get(match[1].length) ?? []), g]);
  });
  // The shallowest level with several headings holds the chapters; a lone "#" is the book title.
  const level = [1, 2].find((candidate) => (byLevel.get(candidate)?.length ?? 0) >= 2 && (byLevel.get(candidate)?.length ?? 0) <= 80);
  if (!level) return [];
  return byLevel.get(level)!.map((g) => {
    const text = lines[g].replace(/^#+\s+/, "").replace(/\s*#*$/, "").trim();
    const numbered = text.match(/^(\d{1,3})[.)]?\s+(\S.*)$/);
    const chapter = matchChapterLine(text);
    return {
      start: g, end: g, number: chapter && !chapter.keywordOnly ? chapter.number : numbered ? Number(numbered[1]) : null,
      title: chapter && !chapter.keywordOnly ? chapter.title : numbered ? numbered[2] : text, prefix: chapter?.prefix ?? "Chapter",
      source: "markdown" as const, confidence: "medium" as const,
    };
  });
}

/** "1 Introduction", "2 Cells" ... without the word "Chapter": needs a clean 1..n run with body text between entries. */
function numberedChapters(lines: string[], excluded: (g: number) => boolean): Boundary[] {
  const found: Candidate[] = [];
  lines.forEach((line, g) => {
    if (excluded(g)) return;
    const match = line.trim().match(/^(\d{1,2})[.)]?\s+([A-Z؀-ۿ][^.!?؟]{2,70})$/);
    if (match && !/^\d+\.\d/.test(line.trim())) found.push({ start: g, end: g, number: Number(match[1]), title: match[2].trim(), prefix: "Chapter" });
  });
  const chain = monotonicChain(dropListClusters(found, lines).kept);
  const sequential = chain.length >= 3 && chain[0].number! <= 2 && chain.every((item, i) => i === 0 || item.number === chain[i - 1].number! + 1);
  if (!sequential) return [];
  // Entries must be separated by real text, otherwise this is a numbered list.
  const spaced = chain.every((item, i) => i === 0 || lines.slice(chain[i - 1].end + 1, item.start).join("\n").trim().length >= 200);
  if (!spaced) return [];
  return chain.map((item) => ({ start: item.start, end: item.end, number: item.number, title: item.title, prefix: item.prefix, source: "numbered" as const, confidence: "medium" as const }));
}

// ---------------------------------------------------------------------------
// Segments (one per page and chapter) and chunk metadata

function buildSegments(pages: PageText[], lines: string[], pageOfLine: number[], boundaries: Boundary[], backMatterAt: number | null, chapters: OutlineChapter[]): Segment[] {
  const chapterAt = (g: number): number | null => {
    if (!boundaries.length || g < boundaries[0].start) return null;
    if (backMatterAt !== null && g >= backMatterAt) return null;
    let found = 0;
    for (let i = 0; i < boundaries.length; i++) if (g >= boundaries[i].start) found = i;
    return found;
  };
  const segments: Segment[] = [];
  let g = 0;
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    let runChapter: number | null | undefined, run: string[] = [];
    const flush = () => {
      const text = run.join("\n").trim();
      if (text) {
        const chapter = runChapter === null || runChapter === undefined ? null : chapters[runChapter];
        segments.push({ pageNumber: pages[pageIndex].pageNumber, text, chapterIndex: chapter?.index ?? null, chapterNumber: chapter?.number ?? null,
          chapterTitle: chapter ? chapterLabel(chapter) : null, sectionTitle: null, subsectionTitle: null });
      }
      run = [];
    };
    while (g < lines.length && pageOfLine[g] === pageIndex) {
      const chapter = chapterAt(g);
      if (runChapter !== undefined && chapter !== runChapter) flush();
      runChapter = chapter;
      run.push(lines[g]);
      g++;
    }
    flush();
  }
  return segments;
}

/**
 * Tracks the section/subsection in effect while chunks of one chapter are
 * visited in book order. The state at the START of each chunk is its label.
 */
export class SectionTracker {
  private section: string | null = null;
  private subsection: string | null = null;
  private chapter: number | null | undefined;
  /** Returns the labels at the start of `content`, then advances past it. */
  next(chapterIndex: number | null, chapterNumber: number | null, content: string): { sectionTitle: string | null; subsectionTitle: string | null } {
    if (chapterIndex !== this.chapter) { this.chapter = chapterIndex; this.section = null; this.subsection = null; }
    const rows = content.split("\n");
    const first = rows.find((row) => row.trim());
    const leading = first ? matchSectionLine(first, chapterNumber) : null;
    if (leading) this.apply(leading);
    const label = { sectionTitle: this.section, subsectionTitle: this.subsection };
    for (const row of rows) {
      const heading = matchSectionLine(row, chapterNumber);
      if (heading) this.apply(heading);
    }
    return label;
  }
  private apply(heading: { level: 2 | 3; title: string }) {
    if (heading.level === 2) { this.section = heading.title; this.subsection = null; }
    else this.subsection = heading.title;
  }
}
