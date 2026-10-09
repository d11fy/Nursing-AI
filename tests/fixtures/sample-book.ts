// Synthetic textbook used by structure, retrieval and chat tests. Every chapter
// holds a few sections and one unique fact so scoping mistakes are detectable.
import type { PageText } from "../../lib/tutor/structure";

export const CHAPTER_TITLES = [
  "Introduction to Anatomy", "The Cell", "Tissues", "The Skeletal System", "The Muscular System",
  "The Nervous System", "The Cardiovascular System", "The Respiratory System", "The Digestive System", "The Endocrine System",
];
export const UNIQUE_FACTS: Record<number, string> = {
  1: "Zorblax-One is the founding term of anatomical position",
  4: "Quenthar-Four describes the bone remodelling cycle of osteoclasts",
  7: "Vellmora-Seven is the pacemaker of the cardiac conduction path",
  10: "Praxium-Ten regulates the pituitary feedback loop",
};
const WORD_NUMBERS = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const PARAGRAPH_BREAK = "\n\n";
export type BookStyle = "chapter-number" | "chapter-words" | "arabic" | "unit" | "markdown" | "split-lines" | "numberless";

const filler = (chapter: number, section: number, repeat = 6) =>
  `Chapter ${chapter} section ${section} explains routine material about ${CHAPTER_TITLES[chapter - 1].toLowerCase()} for nursing students and the surrounding clinical context. `.repeat(repeat);

function heading(chapter: number, style: BookStyle): string {
  const title = CHAPTER_TITLES[chapter - 1];
  switch (style) {
    case "chapter-words": return `Chapter ${WORD_NUMBERS[chapter - 1]}: ${title}`;
    case "arabic": return `الفصل ${["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"][chapter - 1]}: ${title}`;
    case "unit": return `Unit ${chapter} ${title}`;
    case "markdown": return `# ${title}`;
    case "numberless": return `# ${title}`;
    case "split-lines": return `CHAPTER\n${chapter}\n${title}`;
    default: return `Chapter ${chapter}: ${title}`;
  }
}

/** `sections` and `repeat` scale a chapter up so it needs several study parts. */
export function chapterText(chapter: number, style: BookStyle = "chapter-number", size: { sections?: number; repeat?: number } = {}): string {
  const { sections = 3, repeat = 6 } = size;
  const fact = UNIQUE_FACTS[chapter] ? `${PARAGRAPH_BREAK}${UNIQUE_FACTS[chapter]}. This is the key concept of the chapter.` : "";
  const sectionHeading = (section: number) => (style === "markdown" || style === "numberless" ? `## ${chapter}.${section} Topic ${section} of ${CHAPTER_TITLES[chapter - 1]}` : `${chapter}.${section} Topic ${section} of ${CHAPTER_TITLES[chapter - 1]}`);
  const body = Array.from({ length: sections }, (_, i) => [sectionHeading(i + 1), filler(chapter, i + 1, repeat) + (i === 0 ? fact : "")]).flat();
  return [heading(chapter, style), ...body].join(PARAGRAPH_BREAK);
}

/** One page per chapter plus an optional table of contents. `pageNumbers:false` models a book without page numbers. */
export function buildBook(options: { style?: BookStyle; toc?: boolean; chapters?: number; pageNumbers?: boolean; pagesPerChapter?: number; bulk?: Record<number, { sections: number; repeat: number }> } = {}): PageText[] {
  const { style = "chapter-number", toc = true, chapters = 10, pageNumbers = true, pagesPerChapter = 2, bulk = {} } = options;
  const pages: PageText[] = [];
  let page = 1;
  const push = (text: string) => { pages.push({ pageNumber: pageNumbers ? page : null, text }); page++; };
  push("Anatomy & Physiology\nA complete introductory textbook for nursing students.");
  if (toc && style !== "numberless") {
    const entries = Array.from({ length: chapters }, (_, i) => {
      const where = 3 + i * pagesPerChapter;
      const title = CHAPTER_TITLES[i];
      return style === "arabic" ? `الفصل ${i + 1} ${title} ........ ${where}` : `Chapter ${i + 1}  ${title} ........ ${where}`;
    });
    push(["Table of Contents", ...entries].join("\n"));
  }
  for (let chapter = 1; chapter <= chapters; chapter++) {
    const paragraphs = chapterText(chapter, style, bulk[chapter]).split(PARAGRAPH_BREAK);
    const size = Math.ceil(paragraphs.length / pagesPerChapter);
    for (let part = 0; part < pagesPerChapter; part++) {
      const slice = paragraphs.slice(part * size, (part + 1) * size);
      if (slice.length) push(slice.join(PARAGRAPH_BREAK));
    }
  }
  return pages;
}
