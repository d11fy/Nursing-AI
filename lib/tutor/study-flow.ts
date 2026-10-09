import 'server-only';
import { parseStudyIntent, type StudyIntent } from './chapter-intent';
import { chapterLabel, type DocumentOutline, type OutlineChapter } from './structure';
import { planChapter, planNavigation, sampleItems, type ChapterPlan, type PlanItem, type StudyState } from './study-plan';
import { ensureDocumentStructure } from './restructure';
import { listChunkMeta, listPageRangeMeta, loadEvidence, loadStudyDocument, type StudyDocument } from './study-data';
import { tokenize } from './numbering';
import { logEvent } from '@/lib/log';
import type { KnowledgeChunk } from '@/lib/ai/provider';
import type { ChatErrorCode } from '@/lib/chat/errors';

export type StudyTurn =
  | { kind: 'none' }
  | { kind: 'reply'; code: ChatErrorCode; text: string; documentId: string }
  | { kind: 'coverage'; mode: 'walkthrough' | 'overview' | 'quiz' | 'document_overview' | 'page_range'; document: StudyDocument; chapter: OutlineChapter | null;
      sources: KnowledgeChunk[]; state: StudyState | null; header: string; footer: string; promptContext: Record<string, unknown>; trace: Record<string, unknown> }
  | { kind: 'focused'; document: StudyDocument; chapter: OutlineChapter; state: StudyState; header: string; promptContext: Record<string, unknown>;
      scope: { documentId: string; chapterIndex: number }; topic: string };

export type DocumentCandidate = { id: string; title: string };

const TITLE_STOP = new Set(['the', 'and', 'of', 'for', 'book', 'pdf', 'docx', 'pptx', 'txt', 'من', 'في', 'كتاب']);
/** Candidates are ordered by priority; a title the student names explicitly beats the order. */
export function pickStudyDocument(question: string, candidates: DocumentCandidate[]): DocumentCandidate | null {
  if (!candidates.length) return null;
  const asked = new Set(tokenize(question));
  if (candidates.length > 1) {
    for (const candidate of candidates) {
      const words = tokenize(candidate.title).filter((word) => word.length >= 3 && !TITLE_STOP.has(word));
      const matched = words.filter((word) => asked.has(word)).length;
      if (words.length && matched >= Math.min(2, words.length) && matched / words.length >= 0.6) return candidate;
    }
  }
  return candidates[0];
}

export function findChapter(outline: DocumentOutline, number: number): OutlineChapter | null {
  const exact = outline.chapters.find((chapter) => chapter.number === number);
  if (exact) return exact;
  // Chapters that carry no printed number are addressed by their order of appearance.
  return outline.chapters.every((chapter) => chapter.number === null) ? outline.chapters[number - 1] ?? null : null;
}

const chapterLine = (chapter: OutlineChapter) => `${chapter.number ?? chapter.index}. ${chapter.title || chapter.prefix}`;
export function formatOutline(outline: DocumentOutline, limit = 60): string {
  const lines = outline.chapters.slice(0, limit).map(chapterLine);
  if (outline.chapters.length > limit) lines.push(`... و${outline.chapters.length - limit} فصلًا آخر`);
  return lines.join('\n');
}

function reply(document: StudyDocument, code: ChatErrorCode, text: string): StudyTurn {
  return { kind: 'reply', code, text, documentId: document.id };
}

function sectionsInPart(chapter: OutlineChapter | null, sections: string[]): string[] {
  return sections.length ? sections : chapter?.sections.slice(0, 12).map((section) => section.title) ?? [];
}

const WALKTHROUGH_RULES = [
  'S1..Sn are consecutive passages of ONE part of this chapter, already in book order. Teach all of them, in that order, without skipping any passage.',
  'Keep the book\'s own section headings and terminology. Use only this chapter\'s material; any extra explanation must be brief and clearly general.',
  'The application adds the chapter/part header and the "كمل" footer. Do not write part numbers, "continue" prompts or a closing question about what to study next.',
];

export async function resolveStudyTurn(input: { userId: string; question: string; document: DocumentCandidate | null; state: StudyState | null; forcedChapterIndex?: number | null }): Promise<StudyTurn> {
  if (!input.document) return { kind: 'none' };
  let document = await loadStudyDocument(input.userId, input.document.id);
  if (!document) return { kind: 'none' };
  const state = input.state && input.state.documentId === document.id ? input.state : null;
  const forced = input.forcedChapterIndex ?? null;
  // A chapter tapped in the chapter list is a decision by the student, not something to infer from the text.
  const intent: StudyIntent = forced ? { kind: 'chapter', number: 0, action: 'walkthrough', topic: '' } : parseStudyIntent(input.question, { hasDocument: true, hasChapter: Boolean(state?.chapterIndex) });
  if (intent.kind === 'none') return { kind: 'none' };

  // Books uploaded before structure detection are upgraded the first time a chapter is asked for.
  if (document.structureVersion < 1) {
    await ensureDocumentStructure(document.id);
    document = (await loadStudyDocument(input.userId, document.id)) ?? document;
  }
  const outline = document.outline;
  const hasChapters = Boolean(outline && outline.chapterCount > 0 && outline.confidence !== 'none');

  if (intent.kind === 'document_overview') return documentOverview(input.userId, document);
  if (!hasChapters || !outline) {
    logEvent('CHAPTER_NOT_FOUND', { documentId: document.id, reason: 'no_structure' });
    return reply(document, 'STRUCTURE_UNCERTAIN', `لم أستطع تحديد فصول «${document.title}» بدقة، ولا أريد تخمين فصل خاطئ.\nحدّد الصفحات (مثل: اشرح الصفحات 40-60) أو اسألني عن موضوع محدد من الكتاب.`);
  }
  if (intent.kind === 'list_chapters') {
    const note = outline.confidence === 'medium' ? '\n\nملاحظة: ترتيب الفصول مستنتج من ظهورها في الكتاب.' : '';
    return reply(document, 'STRUCTURE_UNCERTAIN', `فصول «${document.title}» (${outline.chapterCount}):\n${formatOutline(outline)}${note}\n\nاكتب مثلًا: اشرحلي الفصل 2.`);
  }
  if (outline.confidence === 'low' && !forced) {
    logEvent('CHAPTER_NOT_FOUND', { documentId: document.id, reason: 'low_confidence', chapterCount: outline.chapterCount });
    return reply(document, 'STRUCTURE_UNCERTAIN', `لم أتأكد من ترتيب فصول «${document.title}». هذه الفصول التي اكتشفتها:\n${formatOutline(outline)}\n\nاكتب رقم الفصل الصحيح (مثل: اشرحلي الفصل 2) وسأبدأ منه.`);
  }

  // --- choose the chapter ---------------------------------------------------------------
  const current = state?.chapterIndex ? outline.chapters.find((chapter) => chapter.index === state.chapterIndex) ?? null : null;
  let target: OutlineChapter | null = null;
  if (intent.kind === 'chapter') {
    target = forced ? outline.chapters.find((chapter) => chapter.index === forced) ?? null : findChapter(outline, intent.number);
    if (!target) {
      const inToc = outline.tocOnly.some((entry) => entry.number === intent.number);
      logEvent('CHAPTER_NOT_FOUND', { documentId: document.id, requested: intent.number, chapterCount: outline.chapterCount, tocOnly: inToc });
      if (inToc) return reply(document, 'STRUCTURE_UNCERTAIN', `الفصل ${intent.number} مذكور في فهرس «${document.title}» لكني لم أجد عنوانه داخل الملف، فلا أريد تخمين مكانه.\nالفصول التي تأكدت منها:\n${formatOutline(outline)}`);
      const numbers = outline.chapters.map((chapter) => chapter.number ?? chapter.index);
      return reply(document, 'CHAPTER_NOT_FOUND', `«${document.title}» يحتوي على ${outline.chapterCount} فصلًا فقط (من ${Math.min(...numbers)} إلى ${Math.max(...numbers)})، ولا يوجد الفصل ${intent.number}.\n\nالفصول المتاحة:\n${formatOutline(outline)}`);
    }
  } else if (intent.kind === 'navigate') {
    const wanted = (current?.index ?? 0) + (intent.direction === 'next' ? 1 : -1);
    target = outline.chapters.find((chapter) => chapter.index === wanted) ?? null;
    if (!target) {
      const text = intent.direction === 'next'
        ? (current ? `أنت في آخر فصل: ${chapterLabel(current)}. لا يوجد فصل بعده.` : `لا أعرف أين وصلنا في «${document.title}». اكتب رقم الفصل (مثل: اشرحلي الفصل 1).`)
        : `أنت في أول فصل${current ? `: ${chapterLabel(current)}` : ''}. لا يوجد فصل قبله.`;
      return reply(document, 'CHAPTER_NOT_FOUND', text);
    }
  } else target = current;
  if (!target) return { kind: 'none' };

  // --- plan the parts ------------------------------------------------------------------
  const planFor = async (chapter: OutlineChapter): Promise<ChapterPlan> => planChapter(await listChunkMeta(input.userId, document.id, chapter.index));
  let plan = await planFor(target);
  if (!plan.parts.length) return reply(document, 'RAG_NO_MATCH', `لم أجد نصًا مقروءًا داخل ${chapterLabel(target)}.`);
  const sameChapter = state?.chapterIndex === target.index;
  let partIndex = 1, advancedFrom: number | null = null, mode: 'walkthrough' | 'overview' | 'quiz' = 'walkthrough';
  let items: PlanItem[] = [];

  if (intent.kind === 'continue' || intent.kind === 'back' || intent.kind === 'part') {
    const moved = planNavigation(intent.kind, plan, { position: sameChapter ? state!.position : null, part: state?.part ?? null }, intent.kind === 'part' ? intent.part : undefined);
    if (moved.kind === 'reply') return reply(document, 'CHAPTER_NOT_FOUND', `${chapterLabel(target)} مقسوم إلى ${moved.total} أجزاء فقط.`);
    if (moved.kind === 'next-chapter') {
      const next = outline.chapters.find((chapter) => chapter.index === target!.index + 1);
      if (!next) return reply(document, 'CHAPTER_NOT_FOUND', `انتهينا من ${chapterLabel(target)}، وهو آخر فصل في «${document.title}». اكتب «اختبرني فيه» لاختبار قصير.`);
      advancedFrom = target.index; target = next; plan = await planFor(next);
      if (!plan.parts.length) return reply(document, 'RAG_NO_MATCH', `لم أجد نصًا مقروءًا داخل ${chapterLabel(next)}.`);
    } else partIndex = moved.part;
  } else if (intent.kind === 'chapter' && intent.action === 'summary') mode = 'overview';
  else if (intent.kind === 'chapter' && intent.action === 'quiz' || intent.kind === 'quiz_current') mode = 'quiz';

  const label = chapterLabel(target);
  const inferred = outline.confidence === 'medium' && target.number === null;
  const base = { mode: mode === 'overview' ? 'chapter_overview' : mode === 'quiz' ? 'chapter_quiz' : 'chapter_walkthrough', book: document.title, chapter: label,
    chapter_order_inferred: inferred, instructions: [] as string[] };

  if (intent.kind === 'chapter' && intent.action === 'focused') {
    logEvent('CHAPTER_RESOLVED', { documentId: document.id, chapterIndex: target.index, mode: 'focused', confidence: outline.confidence });
    return {
      kind: 'focused', document, chapter: target, topic: intent.topic, scope: { documentId: document.id, chapterIndex: target.index },
      header: `### ${label}\n\n`,
      state: { documentId: document.id, chapterIndex: target.index, chapterNumber: target.number, chapterTitle: target.title, sectionTitle: sameChapter ? state!.sectionTitle : null,
        part: sameChapter ? state!.part : null, totalParts: plan.parts.length, position: sameChapter ? state!.position : null, mode: 'focused' },
      promptContext: { chapter_study: { ...base, mode: 'chapter_focused', topic: intent.topic, instructions: [
        'S1..Sn were retrieved ONLY from this chapter. Answer the student\'s specific question from them; do not wander into other chapters.',
        'If the chapter passages do not answer the question, say so and ask the student to check the chapter or the topic wording.'] } },
    };
  }

  if (mode === 'walkthrough') {
    const part = plan.parts[partIndex - 1];
    items = part.items;
    const sources = await loadEvidence(input.userId, document, items);
    const hasMore = partIndex < plan.parts.length;
    const nextChapter = outline.chapters.find((chapter) => chapter.index === target!.index + 1);
    const total = plan.parts.length;
    const header = `### ${label}${total > 1 ? ` — الجزء ${partIndex} من ${total}` : ''}\n\n${advancedFrom ? `*(أنهينا الفصل السابق، وننتقل الآن إلى ${label})*\n\n` : ''}`;
    const footer = hasMore
      ? `\n\n---\n*الجزء ${partIndex} من ${total}. اكتب «كمل» للجزء ${partIndex + 1}، أو «اختبرني فيه» لاختبار قصير.*`
      : `\n\n---\n*انتهى ${label}. اكتب «اختبرني فيه» لاختبار قصير${nextChapter ? `، أو «روح للشابتر اللي بعده» (${chapterLabel(nextChapter)})` : ''}.*`;
    logEvent('CHAPTER_RESOLVED', { documentId: document.id, chapterIndex: target.index, mode: 'walkthrough', part: partIndex, totalParts: total, chunkCount: items.reduce((n, item) => n + item.chunks.length, 0), confidence: outline.confidence });
    return {
      kind: 'coverage', mode: 'walkthrough', document, chapter: target, sources, header, footer,
      state: { documentId: document.id, chapterIndex: target.index, chapterNumber: target.number, chapterTitle: target.title, sectionTitle: part.sections.at(-1) ?? null,
        part: partIndex, totalParts: total, position: part.lastChunkIndex, mode: 'walkthrough' },
      promptContext: { chapter_study: { ...base, part: partIndex, total_parts: total, sections_in_this_part: sectionsInPart(target, part.sections),
        pages: part.pageStart !== null ? `${part.pageStart}-${part.pageEnd}` : null, instructions: WALKTHROUGH_RULES } },
      trace: { documentId: document.id, chapterIndex: target.index, chapterTitle: target.title, part: partIndex, totalParts: total, chunkIds: sources.flatMap((s) => s.chunkIds ?? []) },
    };
  }

  const studiedUpTo = intent.kind === 'quiz_current' && sameChapter ? state!.position : null;
  items = sampleItems(plan, 10, studiedUpTo);
  const sources = await loadEvidence(input.userId, document, items);
  const asQuiz = mode === 'quiz';
  logEvent('CHAPTER_RESOLVED', { documentId: document.id, chapterIndex: target.index, mode, chunkCount: items.reduce((n, item) => n + item.chunks.length, 0), confidence: outline.confidence });
  return {
    kind: 'coverage', mode: asQuiz ? 'quiz' : 'overview', document, chapter: target, sources,
    header: asQuiz ? '' : `### ${label} — نظرة عامة\n\n`,
    footer: asQuiz ? '' : `\n\n---\n*هذه نظرة عامة على ${label}. اكتب «كمل» لشرحه بالتفصيل من البداية.*`,
    state: { documentId: document.id, chapterIndex: target.index, chapterNumber: target.number, chapterTitle: target.title, sectionTitle: state?.sectionTitle ?? null,
      part: sameChapter ? state!.part : null, totalParts: plan.parts.length, position: asQuiz && sameChapter ? state!.position : null, mode: asQuiz ? 'quiz' : 'overview' },
    promptContext: { chapter_study: { ...base, total_parts: plan.parts.length, instructions: asQuiz
      ? ['S1..Sn are passages spread across the chapter in book order. Present exactly ONE new interactive multiple-choice question (fill the quiz field) based only on them; do not reveal the answer.',
          'Vary the tested passage from one question to the next so the whole studied chapter is covered over time.']
      : ['S1..Sn are passages sampled evenly from the start to the end of the chapter, in order. Give an ordered overview of the whole chapter that touches each passage; it is not the detailed walkthrough.'] } },
    trace: { documentId: document.id, chapterIndex: target.index, chapterTitle: target.title, mode, chunkIds: sources.flatMap((s) => s.chunkIds ?? []) },
  };
}

async function documentOverview(userId: string, document: StudyDocument): Promise<StudyTurn> {
  const plan = planChapter(await listChunkMeta(userId, document.id, null));
  if (!plan.parts.length) return reply(document, 'RAG_NO_MATCH', `لم أجد نصًا مقروءًا في «${document.title}».`);
  const sources = await loadEvidence(userId, document, sampleItems(plan, 10));
  const byChapter = document.outline && document.outline.chapterCount > 1;
  return {
    kind: 'coverage', mode: 'document_overview', document, chapter: null, sources, header: `### نظرة عامة على «${document.title}»\n\n`,
    footer: byChapter ? '\n\n---\n*لشرح مفصل اكتب مثلًا: «اشرحلي الفصل 1» أو «ما هي الفصول؟».*' : '\n\n---\n*لشرح جزء محدد اكتب رقم الصفحة أو اسم الموضوع.*',
    state: { documentId: document.id, chapterIndex: null, chapterNumber: null, chapterTitle: null, sectionTitle: null, part: null, totalParts: null, position: null, mode: 'document_overview' },
    promptContext: { document_study: { mode: 'document_overview', book: document.title, instructions: [
      'S1..Sn are passages sampled evenly from the BEGINNING to the END of the file, in order. Give an ordered overview that touches every passage so the end of the file is represented as much as the start.',
      'Say clearly that this is an overview of the whole file and the student can ask for any chapter or page in detail.'] } },
    trace: { documentId: document.id, mode: 'document_overview', chunkIds: sources.flatMap((s) => s.chunkIds ?? []) },
  };
}


/** "From the start of the file through section 3": evidence is the indexed pages of that range and nothing after it. */
export async function resolvePageRange(userId: string, documentId: string, range: { start: number; end: number }): Promise<StudyTurn> {
  const document = await loadStudyDocument(userId, documentId);
  if (!document) return { kind: 'none' };
  const plan = planChapter(await listPageRangeMeta(userId, documentId, range.start, range.end));
  if (!plan.parts.length) return reply(document, 'RAG_NO_MATCH', `لم أجد الصفحات ${range.start}–${range.end} داخل «${document.title}».`);
  const sources = await loadEvidence(userId, document, sampleItems(plan, 10));
  return {
    kind: 'coverage', mode: 'page_range', document, chapter: null, sources, header: '', footer: '', state: null,
    promptContext: { document_study: { mode: 'page_range', book: document.title, pages: `${range.start}-${range.end}`, instructions: [
      `S1..Sn are the indexed pages ${range.start} to ${range.end} of the file, in order. Teach them in source order and stop at the end of page ${range.end}; use nothing from later pages.`] } },
    trace: { documentId, mode: 'page_range', pages: `${range.start}-${range.end}`, chunkIds: sources.flatMap((s) => s.chunkIds ?? []) },
  };
}
