export type NursingYear = "year1" | "year2" | "year3" | "year4" | "other";
export type UserRole = "student" | "admin";
export type UserStatus = "active" | "suspended";
export type MessageRole = "user" | "assistant" | "system";
export type SourceType = "book" | "lecture" | "notes" | "questions" | "reference";
export type DocumentStatus = "uploading" | "processing" | "ready" | "failed";
export type SubjectStatus = "active" | "inactive";
export type UsageType = "chat" | "vision" | "embedding";
export type FeedbackReason =
  | "unclear"
  | "inaccurate"
  | "too_long"
  | "missed_question"
  | "other";

export type Profile = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  university: string | null;
  nursing_year: NursingYear;
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
  status: SubjectStatus;
  created_at: string;
};

export type Conversation = {
  id: string;
  user_id: string;
  title: string;
  subject_id: string | null;
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
    };
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- empty schema namespace
    Enums: {};
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- empty schema namespace
    CompositeTypes: {};
  };
};
