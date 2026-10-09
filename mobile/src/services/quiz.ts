import { gradePracticeAnswer } from "../../../lib/exams/answer-grading";
export function questionText(question: any): string {
  return question.questionText || question.stem || question.question || "";
}
export function questionAnswer(question: any): unknown {
  return (
    question.correct_answer ??
    question.correctAnswer ??
    question.correctOptionId ??
    question.correct_option_id
  );
}
export function questionOptions(
  question: any,
): { id: string; value: string; text: string }[] {
  return (Array.isArray(question.options) ? question.options : []).map(
    (option: any, index: number) => {
      if (typeof option === "string")
        return { id: String(index), value: option, text: option };
      const id = String(option.id ?? option.key ?? index);
      return { id, value: id, text: option.text || option.option || id };
    },
  );
}
export function isCorrectAnswer(
  question: any,
  answer: unknown,
  studyPack: boolean,
): boolean {
  return studyPack
    ? typeof answer === "string" &&
        answer.trim().toLowerCase() ===
          String(questionAnswer(question) ?? "")
            .trim()
            .toLowerCase()
    : gradePracticeAnswer(answer, questionAnswer(question));
}
/** Answer key and rationale returned by the server once an answer is recorded. */
export interface AnswerFeedback {
  correctAnswer: unknown;
  explanation: string | null;
  isCorrect: boolean | null;
}
/**
 * Reads the per-question feedback from either answer endpoint. Practice exams
 * in EXAM mode return no review until completion, which yields null here.
 */
export function answerFeedback(response: any): AnswerFeedback | null {
  const source = response?.review ?? response;
  if (!source || source.correctAnswer === undefined) return null;
  return {
    correctAnswer: source.correctAnswer,
    explanation: source.rationale ?? source.explanation ?? null,
    isCorrect: typeof source.isCorrect === "boolean" ? source.isCorrect : null,
  };
}
/** Maps the completion review (both quiz kinds) by question id. */
export function completionReview(summary: any): Map<string, AnswerFeedback> {
  const items: any[] = Array.isArray(summary?.review) ? summary.review : [];
  return new Map(
    items
      .filter((item) => item && typeof item.questionId === "string")
      .map((item) => [item.questionId, answerFeedback(item)!] as const)
      .filter(([, feedback]) => feedback !== null),
  );
}
