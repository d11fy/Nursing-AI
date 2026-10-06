export type MasteryLabel = "insufficient" | "needs_review" | "developing" | "good" | "strong";

export type TopicProgress = {
  subjectId: string | null;
  subjectName: string;
  topicKey: string;
  topicName: string;
  masteryScore: number;
  quizAccuracy: number | null;
  quizAnswerCount: number;
  mistakeCount: number;
  unresolvedMistakeCount: number;
  flashcardKnownCount: number;
  flashcardReviewCount: number;
  recoveryCount: number;
  evidenceCount: number;
  hasEnoughEvidence: boolean;
  label: MasteryLabel;
  lastActivityAt: string | null;
};

export type MistakeStatus = "new" | "reviewing" | "mastered";

export type MistakeRecord = {
  id: string;
  subjectId: string;
  subjectName: string;
  studyPackId: string | null;
  studyPackTitle: string | null;
  topicKey: string;
  topic: string;
  questionType: string | null;
  question: string;
  options: string[];
  studentAnswer: string;
  correctAnswer: string;
  rationale: string | null;
  sourceReference: string | null;
  wrongCount: number;
  status: MistakeStatus;
  firstWrongAt: string;
  lastWrongAt: string;
  lastReviewedAt: string | null;
};

