// A concept that appears only in the last 10% of a long document must reach
// the final summary, and coverage metadata must show the last pages were read.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { bootDatabase, db, mockNextRuntime } from "./helpers/harness";
import { coverageLabel, describeCoverage, evenExcerpt, planSections } from "../features/study-pack/services/coverage";

mockNextRuntime();

const RARE = "Zeta-protocol for refractory hyperkalemia";
const filler = (page: number) =>
  `Page ${page} discusses routine fundamentals of nursing assessment, documentation and vital sign trends. `.repeat(18);
// 100 pages, ~1,900 characters each: far beyond the single-request budget.
const materials = Array.from({ length: 100 }, (_, index) => {
  const page = index + 1;
  const heading = page % 20 === 1 ? `CHAPTER ${Math.ceil(page / 20)} ROUTINE CARE\n` : "";
  const rare = page === 96 ? `\n${RARE}: give calcium gluconate and recheck potassium. ` : "";
  return { pageNumber: page, text: `${heading}${filler(page)}${rare}` };
});

before(async () => {
  process.env.OPENAI_API_KEY = "coverage-test-key";
  await bootDatabase();
});
after(() => db.close());

test("sections cover every page in order and start at detected chapter headings", () => {
  const sections = planSections(materials, 16000);
  assert.equal(sections[0].pageStart, 1);
  assert.equal(sections.at(-1)!.pageEnd, 100);
  for (let i = 1; i < sections.length; i++) assert.equal(sections[i].pageStart, sections[i - 1].pageEnd! + 1);
  assert.ok(sections.some((section) => section.heading === "CHAPTER 5 ROUTINE CARE"));
  assert.ok(sections.some((section) => section.text.includes(RARE)));
});

test("bounded excerpts used by flashcards and quizzes still include the last section", () => {
  const excerpt = evenExcerpt(materials, 24000);
  assert.ok(excerpt.length <= 24000);
  assert.match(excerpt, /Page \/ Slide 9[0-9]\]/, "the end of the document is represented");
  // The previous implementation cut the document at the budget and never reached the final pages.
  assert.doesNotMatch(materials.slice(0, 12).map((m) => m.text).join(""), /Zeta/);
});

test("long-document summary is hierarchical, includes an end-only concept and records full coverage", async (t) => {
  let digestCalls = 0;
  let finalInput = "";
  t.mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const input = JSON.stringify(body.input);
    const schema = body.text?.format?.name;
    const reply = (payload: unknown) => Response.json({
      id: "r", status: "completed", model: "gpt-6-luna", output: [], output_text: JSON.stringify(payload),
      usage: { input_tokens: 100, output_tokens: 50, input_tokens_details: { cached_tokens: 0 } },
    });
    if (schema === "study_pack_section_digest") {
      digestCalls++;
      // A faithful digest keeps the rare concept when its section contains it.
      const hasRare = input.includes("Zeta-protocol");
      return reply({ heading: "Section", summary: hasRare ? `Covers ${RARE}.` : "Routine assessment.",
        key_concepts: hasRare ? [{ concept: RARE, explanation: "Calcium gluconate then recheck potassium." }] : [],
        definitions: [], clinical_notes: [], must_remember: [] });
    }
    finalInput = input;
    const sawRare = input.includes("Zeta-protocol");
    if (schema === "study_pack_summary") return reply({
      overview: "Fundamentals of assessment.", main_concepts: [{ concept: sawRare ? RARE : "Assessment", explanation: "From the source." }],
      important_definitions: [{ term: "Vital signs", arabic_translation: "العلامات الحيوية", definition: "Core measurements." }],
      clinical_notes: [], what_to_remember: [sawRare ? RARE : "Assessment"], source_references: ["Pages 1-100"],
    });
    return reply({ points: [
      { category: "high_yield", point: sawRare ? RARE : "Assessment" },
      { category: "must_understand", point: "Assessment" }, { category: "exam_focus", point: "Documentation" },
    ] });
  });
  const { generateSummary, generateKeyPoints } = await import("../features/study-pack/services/generator");
  const context = { lectureId: "00000000-0000-4000-8000-0000000000aa", userId: "00000000-0000-4000-8000-0000000000bb", lectureTitle: "Long book", materials };
  const summary = await generateSummary(context);
  const sections = planSections(materials, 16000);
  assert.equal(digestCalls, sections.length, "every section is digested");
  assert.match(finalInput, /Zeta-protocol/, "the synthesis request contains the end-only concept");
  assert.ok(summary.main_concepts.some((concept) => concept.concept === RARE));
  assert.equal(summary.coverage?.method, "hierarchical");
  assert.equal(summary.coverage?.processedSections, summary.coverage?.totalSections);
  assert.equal(summary.coverage?.lastPage, 100);
  assert.equal(summary.coverage?.sections.at(-1)?.pages.endsWith("100"), true);

  const keyPoints = await generateKeyPoints(context);
  assert.ok(keyPoints.points.some((point) => point.point === RARE));
  assert.equal(digestCalls, sections.length, "key points reuse the section digests instead of paying again");
  assert.equal(keyPoints.coverage?.lastPage, 100);
});

test("short documents are sent directly and coverage is labelled honestly", () => {
  const short = [{ pageNumber: 1, text: "Short lecture." }, { pageNumber: 2, text: "Second page." }];
  const sections = planSections(short);
  assert.equal(coverageLabel(describeCoverage("direct", sections, sections.length)), "شمل كل أقسام الملف (1، الصفحات 1–2)");
  const partial = describeCoverage("hierarchical", planSections(materials, 16000), 3);
  assert.match(coverageLabel(partial), /^شمل 3 من \d+ أقسام/);
  assert.equal(coverageLabel(undefined), "مبني من ملف المحاضرة");
});
