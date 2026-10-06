export const MINIMUM_MASTERY_EVIDENCE = 3;

export type QuizEvidence = { isCorrect: boolean; answeredAt: string | Date };

export type MasteryInput = {
  quiz: QuizEvidence[];
  flashcardKnown: number;
  flashcardReviewAgain: number;
  wrongCount: number;
  unresolvedMistakes: number;
  recoveryCount: number;
  now?: Date;
};

export type MasteryResult = {
  score: number;
  quizAccuracy: number | null;
  evidenceCount: number;
  hasEnoughEvidence: boolean;
  label: "insufficient" | "needs_review" | "developing" | "good" | "strong";
};

const clamp = (value: number) => Math.min(100, Math.max(0, value));

export function masteryLabel(score: number, hasEnoughEvidence: boolean): MasteryResult["label"] {
  if (!hasEnoughEvidence) return "insufficient";
  if (score < 50) return "needs_review";
  if (score < 70) return "developing";
  if (score < 85) return "good";
  return "strong";
}

/** Deterministic V1 mastery formula. Missing signals are removed and the
 * remaining weights are normalized, so not using flashcards never means zero. */
export function calculateMastery(input: MasteryInput): MasteryResult {
  const now = input.now ?? new Date();
  let weightedCorrect = 0;
  let quizWeight = 0;
  for (const item of input.quiz) {
    const ageDays = Math.max(0, (now.getTime() - new Date(item.answeredAt).getTime()) / 86_400_000);
    // A stable floor keeps old evidence useful; recent evidence counts modestly more.
    const weight = 0.55 + 0.45 * Math.exp(-ageDays / 90);
    quizWeight += weight;
    if (item.isCorrect) weightedCorrect += weight;
  }
  const quizAccuracy = quizWeight > 0 ? (weightedCorrect / quizWeight) * 100 : null;

  const flashTotal = input.flashcardKnown + input.flashcardReviewAgain;
  const flashcardScore = flashTotal > 0 ? (input.flashcardKnown / flashTotal) * 100 : null;
  const recoveryEvidence = input.wrongCount + input.recoveryCount;
  const recoveryScore = recoveryEvidence > 0
    ? (input.recoveryCount / Math.max(1, input.unresolvedMistakes + input.recoveryCount)) * 100
    : null;

  const signals = [
    quizAccuracy === null ? null : { score: quizAccuracy, weight: 70 },
    flashcardScore === null ? null : { score: flashcardScore, weight: 20 },
    recoveryScore === null ? null : { score: recoveryScore, weight: 10 },
  ].filter((signal): signal is { score: number; weight: number } => signal !== null);

  const totalWeight = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const base = totalWeight
    ? signals.reduce((sum, signal) => sum + signal.score * signal.weight, 0) / totalWeight
    : 0;
  // Repetition matters, but the capped penalty prevents one difficult concept
  // from overwhelming all demonstrated performance.
  const repeatedMistakePenalty = Math.min(12, Math.max(0, input.wrongCount - 1) * 2);
  const score = Math.round(clamp(base - repeatedMistakePenalty));
  const evidenceCount = input.quiz.length + flashTotal + input.recoveryCount;
  const hasEnoughEvidence = evidenceCount >= MINIMUM_MASTERY_EVIDENCE;

  return { score, quizAccuracy: quizAccuracy === null ? null : Math.round(quizAccuracy * 100) / 100,
    evidenceCount, hasEnoughEvidence, label: masteryLabel(score, hasEnoughEvidence) };
}

const ALIASES: Record<string, string> = {
  hf: "heart failure",
  "heart-failure": "heart failure",
};

export function normalizeTopicIdentity(topic: string | null | undefined) {
  const displayName = (topic || "General").normalize("NFKC").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim() || "General";
  const base = displayName.toLocaleLowerCase("en").replace(/[أإآ]/g, "ا").replace(/[ًٌٍَُِّْـ]/g, "");
  const compact = base.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 80) || "general";
  const canonical = ALIASES[compact] ?? base;
  const keyPart = canonical.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 80) || "general";
  const canonicalName = ALIASES[compact]
    ? canonical.replace(/\b\w/g, (letter) => letter.toUpperCase())
    : displayName;
  return { topicKey: `v2:${keyPart}`, topicName: canonicalName };
}

