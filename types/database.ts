export type NursingYear = "year1" | "year2" | "year3" | "year4" | "other";
export type UserRole = "student" | "admin";
export type UserStatus = "active" | "suspended";
export type MessageRole = "user" | "assistant" | "system";
export type SourceType =
  | 'university_lecture' | 'doctor_slides' | 'official_course_material' | 'required_textbook' | 'lab_manual' | 'exam_questions' | 'approved_notes' | 'student_private_file'
  | "BOOK"
  | "UNIVERSITY_LECTURE"
  | "DOCTOR_SLIDES"
  | "SUMMARY"
  | "PAST_EXAM"
  | "QUESTION_BANK"
  | "MODEL_ANSWERS"
  | "LAB_MATERIAL"
  | "REVIEW_NOTES"
  | "book"
  | "lecture"
  | "notes"
  | "questions"
  | "reference"
  | "student_contribution";

export type DocumentStatus = "uploading" | "processing" | "ready" | "failed";
export type SubjectStatus = "active" | "inactive";
export type UsageType = "chat" | "vision" | "embedding" | "lecture_processing" | "summary" | "key_points" | "quiz" | "flashcards";
export type FeedbackReason =
  | "unclear"
  | "inaccurate"
  | "too_long"
  | "missed_question"
  | "other";

export type LectureStatus =
  | "uploading"
  | "uploaded"
  | "processing"
  | "ready"
  | "failed"
  | "expired"
  | "deleted";
export type LectureContributionStatus = "not_submitted" | "pending" | "approved" | "rejected";
export type StudyContentType = "summary" | "key_points" | "quiz" | "flashcards";
export type Classification = "nursing_related" | "not_nursing" | "uncertain";
export type ContributionReviewStatus = "pending" | "approved" | "rejected";

export type Lecture = {
  id: string;
  user_id: string;
  subject_id: string;
  title: string;
  file_name: string;
  original_file_name: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  file_hash: string;
  status: LectureStatus;
  error_message: string | null;
  uploaded_at: string;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  delete_after: string | null;
  deleted_at: string | null;
  contribution_status: LectureContributionStatus;
  contribution_consent_at: string | null;
  contribution_ownership_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LectureChunk = {
  id: string;
  lecture_id: string;
  user_id: string;
  subject_id: string | null;
  content: string;
  page_number: number | null;
  chunk_index: number;
  embedding: number[] | null;
  embedding_provider: string | null;
  embedding_model: string | null;
  embedding_dimensions: number | null;
  created_at: string;
};

export type GeneratedStudyContent = {
  id: string;
  lecture_id: string;
  user_id: string;
  content_type: StudyContentType;
  content_json: unknown;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
  updated_at: string;
};

export type FileCleanupLog = {
  id: string;
  lecture_id: string;
  storage_path: string;
  attempted_at: string;
  status: "success" | "failed";
  error_message: string | null;
};

export type KnowledgeContribution = {
  id: string;
  lecture_id: string;
  user_id: string;
  subject_id: string | null;
  classification: Classification;
  classification_confidence: number | null;
  privacy_flagged: boolean;
  status: ContributionReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_document_id: string | null;
  created_at: string;
};

export type MatchLectureChunkRow = {
  id: string;
  lecture_id: string;
  content: string;
  page_number: number | null;
  similarity: number;
};

export type Profile = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  university: string | null;
  nursing_year: NursingYear;
  academic_year_id: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
};

export type Subject = {
  id: string;
  name_ar: string;
  name_en: string;
  description: string | null;
  description_ar: string | null;
  description_en: string | null;
  icon: string;
  icon_theme: string | null;
  status: SubjectStatus;
  sort_order: number;
  updated_at: string;
  archived_at: string | null;
  created_at: string;
};

export type Conversation = {
  id: string;
  user_id: string;
  title: string;
  subject_id: string | null;
  lecture_id: string | null;
  active_attachment_id: string | null;
  active_attachment_section_index: number | null;
  created_at: string;
  updated_at: string;
};

export type ConversationAttachment = {
  id:string; conversation_id:string; message_id:string|null; user_id:string; file_path:string; file_type:string;
  ordinal:number; vision_extracted_text:string; vision_structured_json:unknown; subject_id:string|null;
  lecture_id:string|null; status:"processing"|"ready"|"failed"; provider:string|null; model:string|null;
  input_tokens:number; output_tokens:number; created_at:string;
};
export type MessageAITrace = {
  id:string; message_id:string; conversation_id:string; user_id:string; resolved_query:string;
  detected_subject:string|null; active_attachment_id:string|null; attachment_ids:unknown;
  retrieved_sources_json:unknown; reranked_sources_json:unknown; evidence_coverage:"SUPPORTED"|"PARTIALLY_SUPPORTED"|"UNSUPPORTED";
  selected_provider:string|null; selected_model:string|null; fallback_used:boolean; final_source_ids_json:unknown;
  refusal_reason:string|null; diagnostics_json:unknown; created_at:string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  image_url: string | null;
  tokens_input: number;
  tokens_output: number;
  model: string | null;
  answer_origin?:string|null;
  source_ids?:unknown;
  created_at: string;
};

export type MessageFeedback = {
  subject_id?:string|null;
  answer_origin?:string|null;
  source_ids?:unknown;
  id: string;
  message_id: string;
  user_id: string;
  is_positive: boolean;
  reason: FeedbackReason | null;
  comment: string | null;
  created_at: string;
};

export type DocumentRow = {
  extraction_page_count: number | null;
  ocr_page_count: number;
  index_version: number;
  id: string;
  title: string;
  file_url: string;
  file_name: string;
  file_size: number | null;
  subject_id: string | null;
  source_type: SourceType;
  status: DocumentStatus;
  vector_store_id: string | null;
  file_id: string | null;
  chunk_count: number;
  error_message: string | null;
  created_by: string | null;
  contribution_id: string | null;
  academic_year_id?: string | null;
  semester?: number | null;
  exam_year?: number | null;
  doctor_name?: string | null;
  exam_type?: string | null;
  notes?: string | null;
  file_hash?: string | null;
  content_hash?: string | null;
  processing_version?: number;
  created_at: string;
};

export type DocumentChunk = {
  id: string;
  document_id: string;
  subject_id: string | null;
  content: string;
  embedding: number[] | null;
  embedding_provider: string | null;
  embedding_model: string | null;
  embedding_dimensions: number | null;
  chapter: string | null;
  page_number: number | null;
  chunk_index: number;
  created_at: string;
};

export type QuestionType =
  | "MCQ"
  | "TRUE_FALSE"
  | "SHORT_ANSWER"
  | "ESSAY"
  | "SATA"
  | "MATCHING"
  | "CASE_STUDY"
  | "CALCULATION"
  | "PRIORITY"
  | "UNKNOWN";

export type QuestionVerificationStatus =
  | "EXTRACTED"
  | "VERIFIED"
  | "NEEDS_REVIEW"
  | "CONFLICT"
  | "REJECTED";

export type SupportType = "DIRECT" | "SUPPORTING" | "CONFLICTING";

export type ExamStatus =
  | "UPLOADED"
  | "EXTRACTING"
  | "PROCESSING"
  | "VERIFYING"
  | "READY"
  | "FAILED";

export type SummaryVerificationStatus =
  | "VERIFIED"
  | "SUPPORTED"
  | "UNVERIFIED"
  | "CONFLICTING";

export type SubjectReadinessStatus =
  | "NOT_READY"
  | "BUILDING"
  | "READY"
  | "NEEDS_REVIEW";

export type Exam = {
  id: string;
  subject_id: string;
  title: string;
  exam_year: number | null;
  semester: number | null;
  exam_type: string;
  doctor_name: string | null;
  document_id: string | null;
  status: ExamStatus;
  total_questions: number;
  verified_questions: number;
  needs_review_questions: number;
  conflict_questions: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type ExamQuestion = {
  id: string;
  exam_id: string | null;
  subject_id: string;
  question_text: string;
  question_type: QuestionType;
  options_json: string[] | Array<{ text: string; label?: string }>;
  correct_answer_json: unknown;
  extracted_answer: string | null;
  explanation: string | null;
  topic: string;
  subtopic: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  difficulty_estimate: number;
  status: QuestionVerificationStatus;
  confidence: number;
  page_number: number | null;
  source_document_id: string | null;
  question_number: number | null;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type QuestionSource = {
  id: string;
  question_id: string;
  document_id: string;
  chunk_id: string | null;
  page_number: number | null;
  quote: string | null;
  support_type: SupportType;
  source_priority: number;
  created_at: string;
};

export type QuestionCluster = {
  id: string;
  subject_id: string;
  topic: string;
  canonical_question: string;
  cluster_summary: string | null;
  occurrences_count: number;
  exam_years_json: number[];
  created_at: string;
  updated_at: string;
};

export type QuestionClusterMember = {
  id: string;
  cluster_id: string;
  question_id: string;
  similarity: number;
  created_at: string;
};

export type ExamTopicStats = {
  id: string;
  subject_id: string;
  topic: string;
  exam_count: number;
  total_exams: number;
  question_count: number;
  frequency: number;
  common_question_types_json: string[];
  avg_difficulty: number;
  updated_at: string;
};

export type SummaryKnowledgePoint = {
  id: string;
  document_id: string;
  subject_id: string;
  point_type: "topic" | "key_point" | "definition" | "important_term" | "table_summary" | "list_item";
  topic: string;
  content: string;
  verification_status: SummaryVerificationStatus;
  verified_by_chunk_id: string | null;
  page_number: number | null;
  created_at: string;
};

export type ExamAuditLog = {
  id: string;
  subject_id: string | null;
  exam_id: string | null;
  question_id: string | null;
  user_id: string | null;
  event_type:
    | "EXAM_UPLOADED"
    | "QUESTION_EXTRACTED"
    | "QUESTION_VERIFIED"
    | "QUESTION_EDITED"
    | "QUESTION_APPROVED"
    | "QUESTION_REJECTED"
    | "CONFLICT_DETECTED";
  details_json: Record<string, unknown>;
  created_at: string;
};

export type StudentExamAttempt = {
  id: string;
  user_id: string;
  subject_id: string;
  exam_id: string | null;
  mode: "STUDY" | "EXAM";
  practice_type: "PAST_EXAM" | "UNIVERSITY_STYLE" | "MIXED";
  total_questions: number;
  answered_questions: number;
  correct_answers: number;
  wrong_answers: number;
  score_percentage: number;
  completed_at: string | null;
  created_at: string;
};

export type StudentExamAttemptAnswer = {
  id: string;
  attempt_id: string;
  question_id: string | null;
  selected_answer: unknown;
  is_correct: boolean | null;
  topic: string | null;
  created_at: string;
};


export type AIProviderName = "openai" | "gemini" | "groq" | "cloudflare";
export type AIProviderRole = "primary" | "economy" | "fast" | "utility";
export type AIProviderStatus = "healthy" | "degraded" | "rate_limited" | "offline" | "disabled";

export type AIProviderSetting = {
  provider: AIProviderName;
  enabled: boolean;
  role: AIProviderRole;
  priority: number;
  simple_enabled: boolean;
  normal_enabled: boolean;
  complex_enabled: boolean;
  vision_enabled: boolean;
  utility_enabled: boolean;
  fallback_enabled: boolean;
  status: AIProviderStatus;
  last_error: string | null;
  last_error_at: string | null;
  consecutive_failures: number;
  cooldown_until: string | null;
  updated_at: string;
};

export type UsageLog = {
  cached_input_tokens?:number;
  reasoning_effort?:string|null;
  pricing_version?:string|null;
  id: string;
  user_id: string;
  type: UsageType;
  model: string | null;
  provider?: string | null;
  feature?: string | null;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  is_free_tier?: boolean;
  latency_ms?: number | null;
  success?: boolean;
  error_code?: string | null;
  fallback_used?: boolean;
  fallback_from?: string | null;
  fallback_reason?: string | null;
  lecture_id: string | null;
  created_at: string;
};

export type Setting = {
  key: string;
  value: unknown;
  updated_at: string;
};

export type MatchDocumentChunkRow = {
  id: string;
  document_id: string;
  content: string;
  chapter: string | null;
  page_number: number | null;
  similarity: number;
};

export type AdminDashboardStats = {
  total_students: number;
  active_students: number;
  questions_today: number;
  questions_month: number;
  images_uploaded: number;
  cost_today: number;
  cost_month: number;
};

export type AdminUsageDay = {
  day: string;
  questions_count: number;
  cost: number;
};

export type AdminStudentRow = {
  user_id: string;
  full_name: string;
  email: string;
  university: string | null;
  nursing_year: NursingYear;
  academic_year_id?: string | null;
  status: UserStatus;
  created_at: string;
  questions_count: number;
  last_activity: string | null;
};

type NoRelationships = { Relationships: [] };

// Typed PostgreSQL tables and application functions.
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile>;
        Update: Partial<Profile>;
      } & NoRelationships;
      subjects: {
        Row: Subject;
        Insert: Partial<Subject>;
        Update: Partial<Subject>;
      } & NoRelationships;
      conversations: {
        Row: Conversation;
        Insert: Partial<Conversation>;
        Update: Partial<Conversation>;
      } & NoRelationships;
      messages: {
        Row: Message;
        Insert: Partial<Message>;
        Update: Partial<Message>;
      } & NoRelationships;
      conversation_attachments: {
        Row: ConversationAttachment;
        Insert: Partial<ConversationAttachment>;
        Update: Partial<ConversationAttachment>;
      } & NoRelationships;
      message_ai_traces: {
        Row: MessageAITrace;
        Insert: Partial<MessageAITrace>;
        Update: Partial<MessageAITrace>;
      } & NoRelationships;
      message_feedback: {
        Row: MessageFeedback;
        Insert: Partial<MessageFeedback>;
        Update: Partial<MessageFeedback>;
      } & NoRelationships;
      documents: {
        Row: DocumentRow;
        Insert: Partial<DocumentRow>;
        Update: Partial<DocumentRow>;
      } & NoRelationships;
      document_chunks: {
        Row: DocumentChunk;
        Insert: Partial<DocumentChunk>;
        Update: Partial<DocumentChunk>;
      } & NoRelationships;
      usage_logs: {
        Row: UsageLog;
        Insert: Partial<UsageLog>;
        Update: Partial<UsageLog>;
      } & NoRelationships;
      settings: {
        Row: Setting;
        Insert: Partial<Setting>;
        Update: Partial<Setting>;
      } & NoRelationships;
      lectures: {
        Row: Lecture;
        Insert: Partial<Lecture>;
        Update: Partial<Lecture>;
      } & NoRelationships;
      lecture_chunks: {
        Row: LectureChunk;
        Insert: Partial<LectureChunk>;
        Update: Partial<LectureChunk>;
      } & NoRelationships;
      generated_study_content: {
        Row: GeneratedStudyContent;
        Insert: Partial<GeneratedStudyContent>;
        Update: Partial<GeneratedStudyContent>;
      } & NoRelationships;
      file_cleanup_logs: {
        Row: FileCleanupLog;
        Insert: Partial<FileCleanupLog>;
        Update: Partial<FileCleanupLog>;
      } & NoRelationships;
      knowledge_contributions: {
        Row: KnowledgeContribution;
        Insert: Partial<KnowledgeContribution>;
        Update: Partial<KnowledgeContribution>;
      } & NoRelationships;
      ai_provider_settings: {
        Row: AIProviderSetting;
        Insert: Partial<AIProviderSetting>;
        Update: Partial<AIProviderSetting>;
      } & NoRelationships;
      exams: {
        Row: Exam;
        Insert: Partial<Exam>;
        Update: Partial<Exam>;
      } & NoRelationships;
      exam_questions: {
        Row: ExamQuestion;
        Insert: Partial<ExamQuestion>;
        Update: Partial<ExamQuestion>;
      } & NoRelationships;
      question_sources: {
        Row: QuestionSource;
        Insert: Partial<QuestionSource>;
        Update: Partial<QuestionSource>;
      } & NoRelationships;
      question_clusters: {
        Row: QuestionCluster;
        Insert: Partial<QuestionCluster>;
        Update: Partial<QuestionCluster>;
      } & NoRelationships;
      question_cluster_members: {
        Row: QuestionClusterMember;
        Insert: Partial<QuestionClusterMember>;
        Update: Partial<QuestionClusterMember>;
      } & NoRelationships;
      exam_topic_stats: {
        Row: ExamTopicStats;
        Insert: Partial<ExamTopicStats>;
        Update: Partial<ExamTopicStats>;
      } & NoRelationships;
      summary_knowledge_points: {
        Row: SummaryKnowledgePoint;
        Insert: Partial<SummaryKnowledgePoint>;
        Update: Partial<SummaryKnowledgePoint>;
      } & NoRelationships;
      exam_audit_logs: {
        Row: ExamAuditLog;
        Insert: Partial<ExamAuditLog>;
        Update: Partial<ExamAuditLog>;
      } & NoRelationships;
      student_exam_attempts: {
        Row: StudentExamAttempt;
        Insert: Partial<StudentExamAttempt>;
        Update: Partial<StudentExamAttempt>;
      } & NoRelationships;
      student_exam_attempt_answers: {
        Row: StudentExamAttemptAnswer;
        Insert: Partial<StudentExamAttemptAnswer>;
        Update: Partial<StudentExamAttemptAnswer>;
      } & NoRelationships;
    };

    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- empty schema namespace
    Views: {};
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      get_today_usage_count: { Args: { p_user_id: string }; Returns: number };
      match_document_chunks: {
        Args: {
          query_embedding: number[];
          query_provider: string;
          query_model: string;
          match_subject_id: string | null;
          match_count: number;
        };
        Returns: MatchDocumentChunkRow[];
      };
      admin_dashboard_stats: { Args: Record<string, never>; Returns: AdminDashboardStats[] };
      admin_usage_last_7_days: { Args: Record<string, never>; Returns: AdminUsageDay[] };
      admin_list_students: { Args: Record<string, never>; Returns: AdminStudentRow[] };
      match_lecture_chunks: {
        Args: {
          query_embedding: number[];
          match_lecture_id: string;
          match_user_id: string;
          match_count: number;
          query_provider: string;
          query_model: string;
        };
        Returns: MatchLectureChunkRow[];
      };
    };
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- empty schema namespace
    Enums: {};
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- empty schema namespace
    CompositeTypes: {};
  };
};
