import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeDocument, chapterLabel, matchChapterLine, matchSectionLine, SectionTracker, type PageText } from "../lib/tutor/structure";
import { parseNumberAt, tokenize } from "../lib/tutor/numbering";
import { buildBook, CHAPTER_TITLES, UNIQUE_FACTS } from "./fixtures/sample-book";

const numberOf = (text: string, roman = true) => parseNumberAt(tokenize(text), 0, { allowRoman: roman })?.value ?? null;

test("number parser understands digits, words, Roman numerals and Arabic ordinals", () => {
  for (const [text, expected] of [["4", 4], ["٤", 4], ["four", 4], ["fourth", 4], ["twenty one", 21], ["IV", 4], ["الرابع", 4], ["رابع", 4],
    ["اربعة", 4], ["الخامس", 5], ["خامسة", 5], ["الحادي عشر", 11], ["الثاني عشر", 12], ["العاشر", 10], ["10", 10]] as const)
    assert.equal(numberOf(text), expected, text);
  assert.equal(numberOf("hello"), null);
});

test("chapter heading formats from the specification are recognised", () => {
  const cases: Array<[string, number, string]> = [
    ["Chapter 4", 4, ""], ["CHAPTER 4", 4, ""], ["Chapter Four", 4, ""], ["Ch. 4", 4, ""], ["Chapter IV", 4, ""],
    ["الفصل الرابع", 4, ""], ["Unit 4", 4, ""], ["Chapter 4: The Skeletal System", 4, "The Skeletal System"],
    ["Chapter 4 - The Skeletal System", 4, "The Skeletal System"], ["CHAPTER FOUR  THE SKELETAL SYSTEM", 4, "THE SKELETAL SYSTEM"],
    ["الفصل الرابع: الجهاز الهيكلي", 4, "الجهاز الهيكلي"], ["الفصل ٤ - الجهاز الهيكلي", 4, "الجهاز الهيكلي"], ["## Chapter 12 Review", 12, "Review"],
    ["Chapter 4 | Skeletal System | 45", 4, "Skeletal System"],
  ];
  for (const [line, number, title] of cases) {
    const match = matchChapterLine(line);
    assert.ok(match, line);
    assert.equal(match.number, number, line);
    assert.equal(match.title, title, line);
  }
});

test("prose, section references and ordinary sentences are not chapter headings", () => {
  for (const line of ["see Chapter 4 for details", "Chapter 4.2 Bone growth", "The chapter explains bones", "Chapter 4 discusses the skeletal system in depth and more words",
    "Unit of measure", "Chapter in review", "chapter 4 is about bones"])
    assert.equal(matchChapterLine(line), null, line);
});

test("section headings need the chapter number and reject doses", () => {
  assert.deepEqual(matchSectionLine("4.1 Bone Structure", 4), { level: 2, number: "4.1", title: "Bone Structure" });
  assert.deepEqual(matchSectionLine("4.1.2 Compact bone", 4)?.level, 3);
  assert.equal(matchSectionLine("5.1 Muscle Types", 4), null);
  assert.equal(matchSectionLine("4.5 mg of calcium daily", 4), null);
  assert.deepEqual(matchSectionLine("## Remodelling", 4), { level: 2, number: null, title: "Remodelling" });
});

test("a ten-chapter book is detected with every chapter, in order, with high confidence", () => {
  const { outline } = analyzeDocument(buildBook(), { title: "Anatomy" });
  assert.equal(outline.chapterCount, 10);
  assert.equal(outline.confidence, "high");
  assert.deepEqual(outline.chapters.map((chapter) => chapter.number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(outline.chapters.map((chapter) => chapter.title), CHAPTER_TITLES);
  assert.equal(outline.tocDetected, true);
  assert.equal(outline.chapters[3].sections.length, 3);
  assert.equal(chapterLabel(outline.chapters[3]), "Chapter 4 — The Skeletal System");
  assert.deepEqual(outline.tocOnly, []);
});

test("every chapter style works: words, Arabic, units, split lines, markdown", () => {
  for (const style of ["chapter-words", "arabic", "unit", "split-lines", "markdown"] as const) {
    const { outline } = analyzeDocument(buildBook({ style, toc: style !== "markdown" }), { title: "Book" });
    assert.equal(outline.chapterCount, 10, style);
    assert.equal(outline.chapters[3].title, CHAPTER_TITLES[3], style);
    assert.ok(outline.confidence === "high" || outline.confidence === "medium", style);
  }
});

test("chapters without printed numbers are ordered by appearance and never marked high confidence", () => {
  const { outline } = analyzeDocument(buildBook({ style: "numberless", toc: false }), { title: "Book" });
  assert.equal(outline.method, "markdown");
  assert.equal(outline.chapterCount, 10);
  assert.equal(outline.confidence, "medium");
  assert.deepEqual(outline.chapters.map((chapter) => chapter.index), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(outline.chapters[3].title, CHAPTER_TITLES[3]);
});

test("a book without page numbers still has a navigable outline", () => {
  const { outline, segments } = analyzeDocument(buildBook({ pageNumbers: false }), { title: "Book" });
  assert.equal(outline.chapterCount, 10);
  assert.ok(outline.chapters.every((chapter) => chapter.pageStart === null));
  assert.ok(segments.every((segment) => segment.pageNumber === null));
  assert.ok(segments.some((segment) => segment.chapterIndex === 4));
});

test("table-of-contents lines and running headers do not create phantom chapters", () => {
  const pages = buildBook();
  // Repeat a running header on every body page of chapter 4 and add a cross reference at the top of chapter 2.
  const patched: PageText[] = pages.map((page, i) => (page.text.startsWith("Chapter 4:") || i === 9 || i === 10
    ? { ...page, text: `Chapter 4: The Skeletal System\n${page.text}` } : page));
  patched[5] = { ...patched[5], text: `Chapter 9: The Digestive System\n${patched[5].text}` };
  const { outline } = analyzeDocument(patched, { title: "Book" });
  assert.equal(outline.chapterCount, 10);
  assert.deepEqual(outline.chapters.map((chapter) => chapter.number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("a preface that lists the chapters without page numbers is not mistaken for the chapters", () => {
  const preface: PageText = { pageNumber: 1, text: ["How this book is organised", ...CHAPTER_TITLES.map((title, i) => `Chapter ${i + 1} ${title}`)].join("\n") };
  const { outline } = analyzeDocument([preface, ...buildBook({ toc: false })], { title: "Book" });
  assert.equal(outline.chapterCount, 10);
  const chapter4 = outline.chapters[3];
  assert.ok(chapter4.pageStart! > 2, "chapter 4 starts in the body, not the preface");
});

test("a book with a gap in numbering is medium confidence and warns", () => {
  const pages = buildBook({ toc: false });
  const filtered = pages.filter((page) => !page.text.startsWith("Chapter 5:"));
  const { outline } = analyzeDocument(filtered, { title: "Book" });
  assert.equal(outline.chapterCount, 9);
  assert.equal(outline.confidence, "medium");
  assert.ok(outline.warnings.some((warning) => warning.includes("غير متسلسل")));
  assert.equal(outline.chapters.find((chapter) => chapter.number === 5), undefined);
});

test("plain text without chapters has no structure and does not guess", () => {
  const { outline, segments } = analyzeDocument([{ pageNumber: 1, text: "Just some notes.\n\nAnother paragraph about nursing." }], { title: "Notes" });
  assert.equal(outline.confidence, "none");
  assert.equal(outline.chapterCount, 0);
  assert.ok(segments.every((segment) => segment.chapterIndex === null));
});

test("segments never mix two chapters and cover every character of the book", () => {
  const pages = buildBook();
  const { segments } = analyzeDocument(pages, { title: "Book" });
  const chapterOf = new Map<number, number>();
  for (const segment of segments) {
    if (segment.chapterIndex === null) continue;
    for (const [n, fact] of Object.entries(UNIQUE_FACTS)) {
      if (segment.text.includes(fact.split(" ")[0])) chapterOf.set(Number(n), segment.chapterIndex);
    }
  }
  for (const n of [1, 4, 7, 10]) assert.equal(chapterOf.get(n), n, `fact ${n} belongs to chapter ${n}`);
  const original = pages.map((page) => page.text.replace(/\s+/g, "")).join("");
  const rebuilt = segments.map((segment) => segment.text.replace(/\s+/g, "")).join("");
  assert.equal(rebuilt, original, "no text dropped or duplicated");
});

test("a chapter that starts mid-page is split there", () => {
  const pages: PageText[] = [
    { pageNumber: 1, text: "Chapter 1: One\nAlpha text about chapter one. ".repeat(1) + "More alpha body text.\nChapter 2: Two\nBeta text about chapter two. More beta body text." },
    { pageNumber: 2, text: "More beta body text that continues. Chapter 3 is mentioned in passing here.\nChapter 3: Three\nGamma text. More gamma body text." },
  ];
  const { outline, segments } = analyzeDocument(pages, { title: "Short" });
  assert.equal(outline.chapterCount, 3);
  assert.deepEqual(segments.map((segment) => segment.chapterIndex), [1, 2, 2, 3]);
  assert.ok(segments[0].text.includes("Alpha") && !segments[0].text.includes("Beta"));
});

test("back matter after the last chapter is not part of it", () => {
  const pages = buildBook({ toc: false });
  pages.push({ pageNumber: 99, text: "Appendix A\nReference tables that are not part of chapter ten." });
  const { outline, segments } = analyzeDocument(pages, { title: "Book" });
  assert.equal(outline.chapterCount, 10);
  assert.equal(segments.at(-1)!.chapterIndex, null);
});

test("section tracker labels each chunk with the section in effect at its start", () => {
  const tracker = new SectionTracker();
  assert.deepEqual(tracker.next(4, 4, "4.1 Bone Structure\nText"), { sectionTitle: "Bone Structure", subsectionTitle: null });
  assert.deepEqual(tracker.next(4, 4, "More bone text\n4.2 Remodelling\nText"), { sectionTitle: "Bone Structure", subsectionTitle: null });
  assert.deepEqual(tracker.next(4, 4, "Continued remodelling text"), { sectionTitle: "Remodelling", subsectionTitle: null });
  assert.deepEqual(tracker.next(5, 5, "Text of chapter five"), { sectionTitle: null, subsectionTitle: null });
});
