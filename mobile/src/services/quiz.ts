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
