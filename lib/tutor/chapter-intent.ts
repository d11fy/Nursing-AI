// Deterministic reading of study commands: "اشرحلي Chapter 4", "كمل", "روح للشابتر اللي بعده".
// No model call and no embedding: the server decides the chapter before any retrieval.
import { normalizeDigits, normalizeForMatch, parseNumberAt } from "./numbering";

export type ChapterAction = "walkthrough" | "focused" | "summary" | "quiz";
export type StudyIntent =
  | { kind: "none" }
  | { kind: "chapter"; number: number; action: ChapterAction; topic: string }
  | { kind: "navigate"; direction: "next" | "previous" }
  | { kind: "continue" }
  | { kind: "back" }
  | { kind: "part"; part: number }
  | { kind: "quiz_current" }
  | { kind: "list_chapters" }
  | { kind: "document_overview" };

export type IntentState = { hasChapter: boolean; hasDocument: boolean };

const words = (value: string) => new Set(value.split(/\s+/).filter(Boolean).map((word) => normalizeForMatch(word)));
const CHAPTER_WORDS = words("chapter chap ch unit module فصل شابتر شبتر شابتير تشابتر وحده باب");
// Words that also mean something else ("2 unit of insulin", "باب الغرفة") only count with the number AFTER them.
const WEAK_KEYWORDS = words("unit module وحده باب ch chap");
const CHAPTER_PLURAL = words("chapters الفصول فصول شابترات الشابترات");
const NEXT_WORDS = words("التالي التاليه بعده بعدها القادم القادمه الجاي الجايه next following");
const PREVIOUS_WORDS = words("السابق السابقه قبله قبلها الماضي الماضيه previous prev before");
const CONTINUE_WORDS = words("كمل كملي كملها كمله اكمل تابع تابعي استمر واصل continue resume next proceed go on carry");
const BACK_WORDS = words("ارجع رجع رجعني ارجعلي رجعلي back previous");
const BACK_FILLER = words("شوي قليل خطوه للخلف الوراء لورا قليلا شويه الى يا لو سمحت من فضلك ممكن");
const PART_WORDS = words("جزء part");
const QUIZ_WORDS = words("اختبرني اختبار امتحني امتحان quiz test اسئله سؤال mcq اختبر");
const SUMMARY_WORDS = words("لخص لخصلي تلخيص ملخص summarize summary overview خلاصه نظره");
const EXPLAIN_WORDS = words("اشرح اشرحلي اشرحي شرح شرحلي وضح وضحلي فسر علمني درسني ادرس ادرسني ابدا start begin explain teach show tell walk cover study");
const WHOLE_WORDS = words("كامل كاملا كامله بالكامل كله كلها كل full entire whole complete all");
const DOCUMENT_WORDS = words("ملف كتاب المحاضره محاضره book file document pdf lecture slides pptx");
const LIST_WORDS = words("فهرس محتويات outline contents كم");
const POLITE = words("لو سمحت من فضلك ممكن بدي ابي ابغى اريد خلينا خلنا يلا طيب الان please can you could would i want to me us now then just");
const GLUE = words("في من عن على الى الي اللي هذا هاد هاذا هذه هاي الكتاب كتاب الملف ملف الدرس the this that book file of from in about a an and و ثم رقم no number num n it فيه عليه منه عنه روح روحلي انتقل ننتقل اذهب go هيا هلا ل لي ليا بشكل مفصل تفصيل بالتفصيل detailed details شرح نقطه جزء");

/** Arabic clitics: "للشابتر" = ل + الشابتر, "بالفصل" = ب + الفصل. */
function bareForms(token: string): string[] {
  const forms = new Set([token]);
  if (token.startsWith("لل")) forms.add(`ال${token.slice(2)}`);
  for (const form of [...forms]) if (/^[وفبلك]/.test(form) && form.length > 3) forms.add(form.slice(1));
  for (const form of [...forms]) if (form.startsWith("ال") && form.length > 3) forms.add(form.slice(2));
  return [...forms];
}
const inSet = (set: Set<string>, token: string) => bareForms(token).some((form) => set.has(form));
const NUMBER_FILLER = new Set(["رقم", "no", "number", "num", "n"]);

export function parseStudyIntent(question: string, state: IntentState): StudyIntent {
  const prepared = normalizeDigits(question.normalize("NFKC")).replace(/(\p{L})(\d)/gu, "$1 $2");
  const raw = prepared.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!raw.length || raw.length > 60 || !state.hasDocument) return { kind: "none" };
  const tokens = raw.map((token) => normalizeForMatch(token));
  const numberAt = (index: number) => parseNumberAt(tokens, index, { allowRoman: raw[index] !== undefined && raw[index] === raw[index].toUpperCase() && raw[index].length > 1 });

  const keywordIndex = tokens.findIndex((token) => inSet(CHAPTER_WORDS, token));
  const used = new Set<number>();
  let chapterNumber: number | null = null;
  if (keywordIndex >= 0) {
    used.add(keywordIndex);
    let at = keywordIndex + 1;
    while (tokens[at] !== undefined && NUMBER_FILLER.has(tokens[at])) { used.add(at); at++; }
    let parsed = numberAt(at);
    if (parsed) for (let k = 0; k < parsed.consumed; k++) used.add(at + k);
    else if (!inSet(WEAK_KEYWORDS, tokens[keywordIndex])) {
      // Number before the keyword: "رابع شابتر", "fourth chapter", "الحادي عشر شابتر".
      for (const width of [2, 1]) {
        const start = keywordIndex - width;
        const candidate = start >= 0 ? numberAt(start) : null;
        if (candidate && candidate.consumed === width) { parsed = candidate; for (let k = 0; k < width; k++) used.add(start + k); break; }
      }
    }
    chapterNumber = parsed?.value ?? null;
  }
  const has = (set: Set<string>) => tokens.some((token, index) => !used.has(index) && inSet(set, token));
  const quiz = has(QUIZ_WORDS), summary = has(SUMMARY_WORDS);

  if (chapterNumber !== null && chapterNumber > 0) {
    const leftover = tokens.filter((token, index) => !used.has(index) && token.length >= 3 && !/^\d+$/.test(token)
      && !inSet(EXPLAIN_WORDS, token) && !inSet(WHOLE_WORDS, token) && !inSet(POLITE, token) && !inSet(GLUE, token)
      && !inSet(QUIZ_WORDS, token) && !inSet(SUMMARY_WORDS, token));
    const action: ChapterAction = quiz ? "quiz" : summary ? "summary" : leftover.length ? "focused" : "walkthrough";
    return { kind: "chapter", number: chapterNumber, action, topic: leftover.join(" ") };
  }
  if (keywordIndex >= 0) {
    if (has(NEXT_WORDS)) return { kind: "navigate", direction: "next" };
    if (has(PREVIOUS_WORDS)) return { kind: "navigate", direction: "previous" };
  }
  if (tokens.some((token) => inSet(CHAPTER_PLURAL, token)) || (keywordIndex >= 0 && has(LIST_WORDS))) return state.hasDocument ? { kind: "list_chapters" } : { kind: "none" };
  if (keywordIndex >= 0) return { kind: "none" };

  const remaining = (...ignored: Set<string>[]) => tokens.filter((token) => !ignored.some((set) => inSet(set, token)));
  const partIndex = tokens.findIndex((token) => inSet(PART_WORDS, token));
  if (partIndex >= 0 && state.hasChapter) {
    const parsed = numberAt(partIndex + 1);
    if (parsed && parsed.value > 0) return { kind: "part", part: parsed.value };
  }
  if (has(BACK_WORDS) && state.hasChapter && remaining(BACK_WORDS, BACK_FILLER, POLITE).length === 0) return { kind: "back" };
  if (quiz && state.hasChapter && remaining(QUIZ_WORDS, POLITE, GLUE).length === 0) return { kind: "quiz_current" };
  if ((has(CONTINUE_WORDS) || has(NEXT_WORDS)) && state.hasChapter
    && remaining(CONTINUE_WORDS, NEXT_WORDS, POLITE, GLUE, EXPLAIN_WORDS).filter((token) => token !== "الشرح" && token !== "شرح").length === 0) return { kind: "continue" };
  if (state.hasDocument && has(DOCUMENT_WORDS) && (summary || (has(EXPLAIN_WORDS) && has(WHOLE_WORDS)))) return { kind: "document_overview" };
  return { kind: "none" };
}
