export interface ChatMessageInput {
  role: "user" | "assistant" | "system";
  content: string;
  imageUrl?: string | null;
}

export interface KnowledgeChunk {
  id?: string;
  documentId?: string;
  title?: string;
  subjectName?: string | null;
  sourceType?: string;
  content: string;
  chapter?: string | null;
  pageNumber?: number | null;
  similarity: number;
  evidenceType?: "USER_UPLOAD" | "PRIVATE_LECTURE" | "UNIVERSITY_SOURCE" | "TEXTBOOK" | "SUPPLEMENTARY";
  attachmentId?: string;
  attachmentOrdinal?: number;
  sectionIndex?: number | null;
  chunkIndex?: number | null;
}

export interface GenerateTextParams {
  messages: ChatMessageInput[];
  knowledge?: KnowledgeChunk[];
  personalizationContext?: string;
  signal?: AbortSignal;
  maxOutputTokens?: number;
  /** Trusted server task instructions, never populated from request JSON. */
  taskPrompt?: string;
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  userId?: string;
  feature?: string;
}

export interface GenerateResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  cachedInputTokens?: number;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
}

export interface StreamChunk {
  delta: string;
}

export interface EmbeddingResult {
  embedding: number[];
  tokens: number;
  model: string;
}

export type ComplexityClass = "UTILITY" | "SIMPLE" | "NORMAL" | "COMPLEX" | "VISION";

export type RoutingReason =
  | "UTILITY_TASK"
  | "SIMPLE_REQUEST"
  | "NORMAL_REQUEST"
  | "COMPLEX_REQUEST"
  | "VISION_REQUEST"
  | "PRIMARY_RATE_LIMIT"
  | "PRIMARY_TIMEOUT"
  | "PROVIDER_DOWN"
  | "BUDGET_OPTIMIZATION"
  | "FREE_TIER_LIMIT"
  | "PRIVACY_REQUIREMENT";

export interface ProviderHealth {
  provider: string;
  status: "healthy" | "degraded" | "rate_limited" | "offline" | "disabled";
  latencyMs?: number;
  model?: string;
  lastError?: string;
  lastChecked: string;
}

export interface AIRequest {
  userId: string;
  feature: string;
  question: string;
  studentContext?: string;
  conversationContext?: ChatMessageInput[];
  subjectId?: string | null;
  lectureId?: string | null;
  retrievedSources?: KnowledgeChunk[];
  sourceConfidence?: number;
  complexity?: ComplexityClass;
  hasImage?: boolean;
  imageUrl?: string | null;
  containsSensitiveData?: boolean;
  preferredProvider?: string;
  signal?: AbortSignal;
  taskPrompt?: string;
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  maxOutputTokens?: number;
}

export interface AIResponse {
  content: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  latencyMs?: number;
  fallbackUsed?: boolean;
  fallbackFrom?: string;
  fallbackReason?: string;
  sources?: KnowledgeChunk[];
}

/**
 * Provider-agnostic contract for AI operations.
 * OpenAI execution contract. Legacy callers retain this shape during rollout.
 */
export interface AIProvider {
  name: string;

  generateText(params: GenerateTextParams): Promise<GenerateResult>;

  generateStream(
    params: GenerateTextParams
  ): AsyncGenerator<StreamChunk, GenerateResult, unknown>;

  generateVisionResponse(
    params: GenerateTextParams & { imageUrl: string }
  ): Promise<GenerateResult>;

  /** Optional streaming vision path for providers that support incremental output. */
  generateVisionStream?(
    params: GenerateTextParams & { imageUrl: string }
  ): AsyncGenerator<StreamChunk, GenerateResult, unknown>;

  createEmbedding(text: string): Promise<EmbeddingResult>;

  /** Batched embedding creation for knowledge-base ingestion (fewer round-trips). */
  createEmbeddings(texts: string[]): Promise<EmbeddingResult[]>;

  calculateCost(params: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens?: number;
  }): number;

  healthCheck(): Promise<ProviderHealth>;

  isAvailable?(): Promise<boolean>;
}
