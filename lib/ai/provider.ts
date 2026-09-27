export interface ChatMessageInput {
  role: "user" | "assistant" | "system";
  content: string;
  imageUrl?: string | null;
}

export interface KnowledgeChunk {
  content: string;
  chapter?: string | null;
  pageNumber?: number | null;
  similarity: number;
}

export interface GenerateTextParams {
  messages: ChatMessageInput[];
  knowledge?: KnowledgeChunk[];
  signal?: AbortSignal;
}

export interface GenerateResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface StreamChunk {
  delta: string;
}

export interface EmbeddingResult {
  embedding: number[];
  tokens: number;
  model: string;
}

/**
 * Provider-agnostic contract for AI operations. Swap the implementation
 * (OpenAI, Gemini, Claude, ...) without touching call sites — see
 * `lib/ai/index.ts` for the factory that picks one via `AI_PROVIDER`.
 */
export interface AIProvider {
  generateText(params: GenerateTextParams): Promise<GenerateResult>;

  generateStream(
    params: GenerateTextParams
  ): AsyncGenerator<StreamChunk, GenerateResult, unknown>;

  generateVisionResponse(
    params: GenerateTextParams & { imageUrl: string }
  ): Promise<GenerateResult>;

  createEmbedding(text: string): Promise<EmbeddingResult>;

  /** Batched embedding creation for knowledge-base ingestion (fewer round-trips). */
  createEmbeddings(texts: string[]): Promise<EmbeddingResult[]>;

  calculateCost(params: {
    model: string;
    inputTokens: number;
    outputTokens: number;
  }): number;
}
