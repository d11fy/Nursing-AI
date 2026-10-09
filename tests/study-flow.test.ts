import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStudyIntent, type StudyIntent } from "../lib/tutor/chapter-intent";
import { partAtPosition, planChapter, planNavigation, sampleItems, type ChunkMeta } from "../lib/tutor/study-plan";

const withDoc = { hasDocument: true, hasChapter: false };
const inChapter = { hasDocument: true, hasChapter: true };
const chapterNumber = (intent: StudyIntent) => (intent.kind === "chapter" ? intent.number : null);

test("every spelling of 'Chapter 4' resolves to chapter 4", () => {
  for (const text of ["Chapter 4", "chapter 4", "CHAPTER 4", "chapter four", "Ch. 4", "ch 4", "شابتر 4", "شابتر ٤", "الفصل الرابع", "الفصل 4", "فصل 4",
    "رابع شابتر", "الشابتر الرابع", "شابتر الرابع", "شابتر اربعة", "4th chapter", "fourth chapter", "chapter IV", "اشرحلي Chapter 4", "اشرحلي شابتر 4",
    "اشرحلي الفصل الرابع من هذا الكتاب", "explain chapter four please", "اشرحلي Chapter 4 كامل", "chapter4", "Unit 4"]) {
    assert.equal(chapterNumber(parseStudyIntent(text, withDoc)), 4, text);
  }
});

test("a plain chapter request starts an ordered walkthrough, a topic narrows it, quiz and summary are separate", () => {
  const action = (text: string) => { const intent = parseStudyIntent(text, withDoc); return intent.kind === "chapter" ? intent.action : intent.kind; };
  assert.equal(action("اشرحلي Chapter 4"), "walkthrough");
  assert.equal(action("اشرحلي Chapter 4 كامل"), "walkthrough");
  assert.equal(action("اشرحلي Chapter 4 من هذا الكتاب"), "walkthrough");
  assert.equal(action("explain osteoporosis in chapter 4"), "focused");
  assert.equal(action("لخص Chapter 4"), "summary");
  assert.equal(action("اختبرني في الفصل الرابع"), "quiz");
  const focused = parseStudyIntent("what is the function of osteoblasts in chapter 4", withDoc);
  assert.equal(focused.kind === "chapter" && focused.topic.includes("osteoblasts"), true);
});

test("follow-up commands are understood from the study state, not by semantic guessing", () => {
  const kind = (text: string, state = inChapter) => parseStudyIntent(text, state).kind;
  for (const text of ["كمل", "كمل لو سمحت", "تابع", "continue", "اللي بعده", "التالي", "كمل الشرح", "next"]) assert.equal(kind(text), "continue", text);
  assert.equal(kind("ارجع شوي"), "back");
  assert.equal(kind("اختبرني فيه"), "quiz_current");
  assert.equal(kind("اختبرني"), "quiz_current");
  const part = parseStudyIntent("اشرح الجزء الثاني", inChapter);
  assert.deepEqual(part, { kind: "part", part: 2 });
  assert.deepEqual(parseStudyIntent("روح للشابتر اللي بعده", inChapter), { kind: "navigate", direction: "next" });
  assert.deepEqual(parseStudyIntent("ارجع للشابتر السابق", inChapter), { kind: "navigate", direction: "previous" });
  assert.deepEqual(parseStudyIntent("next chapter", inChapter), { kind: "navigate", direction: "next" });
  assert.equal(chapterNumber(parseStudyIntent("روح للشابتر الخامس", inChapter)), 5);
});

test("commands only apply when there is something to continue", () => {
  assert.equal(parseStudyIntent("كمل", withDoc).kind, "none");
  assert.equal(parseStudyIntent("اختبرني فيه", withDoc).kind, "none");
  assert.equal(parseStudyIntent("Chapter 4", { hasDocument: false, hasChapter: false }).kind, "none");
  assert.equal(parseStudyIntent("ما هو ضغط الدم الطبيعي", inChapter).kind, "none");
  assert.equal(parseStudyIntent("كمل شرح الدورة الدموية", inChapter).kind, "none");
});

test("ordinary clinical wording with 'unit' or numbers is not a chapter request", () => {
  for (const text of ["give 2 unit of insulin", "how many units in 1 unit of blood", "the 4th stage of labour", "explain the intensive care unit"])
    assert.equal(parseStudyIntent(text, withDoc).kind, "none", text);
});

test("the chapter list and whole-file overviews are recognised", () => {
  assert.equal(parseStudyIntent("ما هي الفصول؟", withDoc).kind, "list_chapters");
  assert.equal(parseStudyIntent("show me the chapters", withDoc).kind, "list_chapters");
  assert.equal(parseStudyIntent("لخص الملف", withDoc).kind, "document_overview");
  assert.equal(parseStudyIntent("اشرح الكتاب كله", withDoc).kind, "document_overview");
});

const meta = (count: number, tokens = 700): ChunkMeta[] => Array.from({ length: count }, (_, i) => ({
  id: `c${i}`, chunkIndex: 100 + i, tokenCount: tokens, pageNumber: 10 + Math.floor(i / 2), sectionTitle: `Section ${Math.floor(i / 6) + 1}`, subsectionTitle: null,
}));

test("a chapter is split into ordered, bounded parts that cover every chunk exactly once", () => {
  const plan = planChapter(meta(60));
  assert.ok(plan.parts.length >= 2);
  const covered = plan.parts.flatMap((part) => part.items.flatMap((item) => item.chunks.map((chunk) => chunk.chunkIndex)));
  assert.deepEqual(covered, Array.from({ length: 60 }, (_, i) => 100 + i));
  assert.ok(plan.parts.every((part) => part.items.length <= 10));
  assert.ok(plan.parts.every((part, i) => i === 0 || part.firstChunkIndex > plan.parts[i - 1].lastChunkIndex));
  assert.equal(plan.parts[0].index, 1);
});

test("navigation moves part by part and hands over to the next chapter at the end", () => {
  const plan = planChapter(meta(60));
  const total = plan.parts.length;
  const position = plan.parts[0].lastChunkIndex;
  assert.equal(partAtPosition(plan, position), 1);
  assert.deepEqual(planNavigation("continue", plan, { position, part: 1 }), { kind: "parts", part: 2 });
  assert.deepEqual(planNavigation("back", plan, { position: plan.parts[1].lastChunkIndex, part: 2 }), { kind: "parts", part: 1 });
  assert.deepEqual(planNavigation("back", plan, { position, part: 1 }), { kind: "parts", part: 1 });
  assert.deepEqual(planNavigation("continue", plan, { position: plan.parts[total - 1].lastChunkIndex, part: total }), { kind: "next-chapter" });
  assert.deepEqual(planNavigation("part", plan, { position, part: 1 }, 2), { kind: "parts", part: 2 });
  assert.equal(planNavigation("part", plan, { position, part: 1 }, total + 1).kind, "reply");
});

test("samples span the whole chapter, always including its first and last passage", () => {
  const plan = planChapter(meta(80));
  const sample = sampleItems(plan, 10);
  assert.equal(sample.length, 10);
  assert.equal(sample[0].firstChunkIndex, 100);
  assert.equal(sample.at(-1)!.lastChunkIndex, 179);
  const studied = sampleItems(plan, 10, plan.parts[0].lastChunkIndex);
  assert.ok(studied.every((item) => item.firstChunkIndex <= plan.parts[0].lastChunkIndex));
});
