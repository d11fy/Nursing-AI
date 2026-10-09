import type { QuizItem, QuizQuestionItem, StudentQuizItem, StudentQuizQuestion } from "./types";

/**
 * The only shape a student receives before answering a question. The answer
 * key and rationale are revealed per question by the answer endpoint, after
 * the student's answer is recorded.
 */
export function toStudentQuizQuestion(question: QuizQuestionItem): StudentQuizQuestion {
  return {
    id: question.id,
    quiz_id: question.quiz_id,
    question_type: question.question_type,
    question: question.question,
    options: question.options,
    source_reference: question.source_reference,
    difficulty: question.difficulty,
    topic: question.topic,
    sort_order: question.sort_order,
  };
}

export function toStudentQuiz(quiz: QuizItem): StudentQuizItem {
  return {
    id: quiz.id,
    study_pack_id: quiz.study_pack_id,
    title: quiz.title,
    difficulty: quiz.difficulty,
    question_count: quiz.question_count,
    created_at: quiz.created_at,
    questions: quiz.questions.map(toStudentQuizQuestion),
  };
}
