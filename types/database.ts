export type NursingYear = "year1" | "year2" | "year3" | "year4" | "other";
export type UserRole = "student" | "admin";
export type UserStatus = "active" | "suspended";
export type MessageRole = "user" | "assistant" | "system";
export type SourceType = "book" | "lecture" | "notes" | "questions" | "reference" | "student_contribution";
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
  created_at: string;
  updated_at: string;
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
  created_at: string;
};

export type MessageFeedback = {
  id: string;
  message_id: string;
  user_id: string;
  is_positive: boolean;
  reason: FeedbackReason | null;
  comment: string | null;
  created_at: string;
};

export type DocumentRow = {
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

export type UsageLog = {
  id: string;
  user_id: string;
  type: UsageType;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
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
