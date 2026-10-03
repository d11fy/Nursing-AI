export type StudyPackStatus = "processing" | "ready" | "failed";
export type GenerationStatus = "not_generated" | "generating" | "ready" | "failed" | "outdated";
export type StudyContentType = "summary" | "key_points";
export type FlashcardStatus = "new" | "known" | "review_again";
export type QuizDifficulty = "easy" | "medium" | "hard" | "mixed";
export type QuizQuestionType = "mcq" | "true_false";

export interface StudyPack {
  id: string;
  user_id: string;
  lecture_id: string;
  document_id: string | null;
  subject_id: string;
  title: string;
  status: StudyPackStatus;
  source_hash: string;
  created_at: string;
  updated_at: string;
}

export interface SummaryContent {
  overview: string;
  main_concepts: Array<{
    concept: string;
    explanation: string;
    arabic_term?: string | null;
  }>;
  important_definitions: Array<{
    term: string;
    arabic_translation: string;
    definition: string;
  }>;
  clinical_notes: Array<{
    note: string;
    importance?: string | null;
  }>;
  what_to_remember: string[];
  source_references?: string[];
}

export interface KeyPointsContent {
  points: Array<{
    category: "must_understand" | "must_memorize" | "exam_focus" | "high_yield";
    point: string;
    arabic_clarification?: string | null;
    source_reference?: string | null;
  }>;
}

export interface FlashcardItem {
  id: string;
  study_pack_id: string;
  front: string;
  back: string;
  card_type: string | null;
  explanation: string | null;
  source_reference: string | null;
  topic: string | null;
  sort_order: number;
  created_at: string;
  // Student specific progress
  progress_status?: FlashcardStatus;
  review_count?: number;
  last_reviewed_at?: string | null;
}

export interface QuizQuestionItem {
  id: string;
  quiz_id: string;
  question_type: QuizQuestionType;
  question: string;
  options: string[];
  correct_answer: string;
  rationale: string;
  source_reference: string | null;
  difficulty: string;
  topic: string;
  sort_order: number;
}

export interface QuizItem {
  id: string;
  study_pack_id: string;
  title: string;
  difficulty: QuizDifficulty;
  question_count: number;
  created_at: string;
  questions: QuizQuestionItem[];
}

export interface StudentMistakeItem {
  id: string;
  user_id: string;
  subject_id: string;
  study_pack_id: string;
  question_id: string;
  topic: string;
  student_answer: string;
  correct_answer: string;
  attempt_id: string | null;
  resolved: boolean;
  created_at: string;
  // Question details for Review Mistakes
  question?: QuizQuestionItem;
}

export interface ExtractedPageItem {
  pageNumber: number | null;
  text: string;
  ocr?: boolean;
}

export interface StudyPackWorkspaceData {
  studyPack: StudyPack;
  lecture: {
    id: string;
    title: string;
    fileName: string;
    fileSizeBytes: number;
    mimeType: string;
    status: string;
    uploadedAt: string;
    deleteAfter: string | null;
  };
  subject: {
    id: string;
    nameAr: string;
    nameEn: string;
  };
  pages: ExtractedPageItem[];
  summaryStatus: GenerationStatus;
  keyPointsStatus: GenerationStatus;
  flashcardsCount: number;
  quizzesCount: number;
  initialSummary?: SummaryContent | null;
  initialKeyPoints?: KeyPointsContent | null;
}
