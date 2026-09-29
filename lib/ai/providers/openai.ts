import OpenAI from "openai";
import type {
  AIProvider,
  ChatMessageInput,
  EmbeddingResult,
  GenerateResult,
  GenerateTextParams,
  ProviderHealth,
  StreamChunk,
} from "@/lib/ai/provider";
import { NURSING_SYSTEM_PROMPT, buildKnowledgeContext } from "@/lib/ai/system-prompt";

function getChatModel(): string {
  return process.env.OPENAI_TEXT_MODEL?.trim() || process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-5.4-mini";
}

function getEmbeddingModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
}

// USD per 1M tokens estimated costs
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5.4-mini": { input: 0.15, output: 0.6 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
};

function toOpenAIMessages(
  systemPrompt: string,
  messages: ChatMessageInput[],
  imageDetail: "auto" | "low" | "high" = "auto"
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const m of messages) {
    if (m.imageUrl) {
      result.push({
        role: "user",
        content: [
          { type: "text", text: m.content || "حلل هذه الصورة المرفقة وأجب عن المطلوب." },
          {
            type: "image_url",
            image_url: {
              url: m.imageUrl,
              detail: imageDetail,
            },
          },
        ],
      });
      continue;
    }
    result.push({ role: m.role, content: m.content });
  }

  return result;
}

function buildSystemPrompt(params: GenerateTextParams): string {
  const knowledge = params.knowledge?.length
    ? buildKnowledgeContext(params.knowledge)
    : "";
  const personalization = params.personalizationContext
    ? `\n\nStudent personalization context (not an academic source):\n${params.personalizationContext}`
    : "";
  return (params.taskPrompt ?? NURSING_SYSTEM_PROMPT) + personalization + knowledge;
}

const DEFAULT_FALLBACK_MODEL = "gpt-4o-mini";

function isModelNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { status?: number; code?: string; message?: string };
  return (
    anyErr.status === 404 ||
    anyErr.code === "model_not_found" ||
    (typeof anyErr.message === "string" &&
      (anyErr.message.includes("does not exist") || anyErr.message.includes("model_not_found")))
  );
}

export class OpenAIProvider implements AIProvider {
  readonly name: string = "openai";
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({ apiKey: apiKey ?? process.env.OPENAI_API_KEY });
  }

  async isAvailable(): Promise<boolean> {
    const key = process.env.OPENAI_API_KEY?.trim();
    return Boolean(key && key !== "sk-placeholder");
  }

  async healthCheck(): Promise<ProviderHealth> {
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key || key === "sk-placeholder") {
      return {
        provider: "openai",
        status: "disabled",
        lastChecked: new Date().toISOString(),
        lastError: "OPENAI_API_KEY is not configured",
      };
    }
    const start = Date.now();
    try {
      const model = getChatModel();
      const res = await this.client.chat.completions.create(
        {
          model,
          messages: [{ role: "user", content: "ping" }],
          max_completion_tokens: 5,
        },
        { timeout: 8_000 }
      );
      return {
        provider: "openai",
        status: "healthy",
        latencyMs: Date.now() - start,
        model: res.model || model,
        lastChecked: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit = msg.toLowerCase().includes("rate limit") || msg.includes("429");
      return {
        provider: "openai",
        status: isRateLimit ? "rate_limited" : "offline",
        latencyMs: Date.now() - start,
        lastError: msg,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  async generateText(params: GenerateTextParams): Promise<GenerateResult> {
    let model = getChatModel();
    let completion;

    try {
      completion = await this.client.chat.completions.create(
        {
          model,
          messages: toOpenAIMessages(buildSystemPrompt(params), params.messages),
          max_completion_tokens: params.maxOutputTokens,
          response_format: params.jsonSchema ? { type: "json_schema", json_schema: { ...params.jsonSchema, strict: true } } : undefined,
          reasoning_effort: params.jsonSchema && /^gpt-5/.test(model) ? "low" : undefined,
        },
        { signal: params.signal }
      );
    } catch (err) {
      if (isModelNotFoundError(err) && model !== DEFAULT_FALLBACK_MODEL) {
        console.warn(`[OpenAI] Model "${model}" not found. Falling back to "${DEFAULT_FALLBACK_MODEL}".`);
        model = DEFAULT_FALLBACK_MODEL;
        completion = await this.client.chat.completions.create(
          {
            model,
            messages: toOpenAIMessages(buildSystemPrompt(params), params.messages),
            max_completion_tokens: params.maxOutputTokens,
            response_format: params.jsonSchema ? { type: "json_schema", json_schema: { ...params.jsonSchema, strict: true } } : undefined,
            reasoning_effort: params.jsonSchema && /^gpt-5/.test(model) ? "low" : undefined,
          },
          { signal: params.signal }
        );
      } else {
        throw err;
      }
    }

    if (params.taskPrompt && completion.choices[0]?.finish_reason === "length") {
      throw new Error("لم تكتمل معالجة المصدر؛ تجاوزت الاستجابة حد الطول، حاول تقسيم المحتوى");
    }
    return {
      content: completion.choices[0]?.message?.content ?? "",
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
      model,
    };
  }

  async *generateStream(
    params: GenerateTextParams
  ): AsyncGenerator<StreamChunk, GenerateResult, unknown> {
    let model = getChatModel();
    let stream;

    try {
      stream = await this.client.chat.completions.create(
        {
          model,
          messages: toOpenAIMessages(buildSystemPrompt(params), params.messages),
          stream: true,
          stream_options: { include_usage: true },
          max_completion_tokens: params.maxOutputTokens,
        },
        { signal: params.signal }
      );
    } catch (err) {
      if (isModelNotFoundError(err) && model !== DEFAULT_FALLBACK_MODEL) {
        console.warn(`[OpenAI] Model "${model}" not found. Falling back to "${DEFAULT_FALLBACK_MODEL}".`);
        model = DEFAULT_FALLBACK_MODEL;
        stream = await this.client.chat.completions.create(
          {
            model,
            messages: toOpenAIMessages(buildSystemPrompt(params), params.messages),
            stream: true,
            stream_options: { include_usage: true },
            max_completion_tokens: params.maxOutputTokens,
          },
          { signal: params.signal }
        );
      } else {
        throw err;
      }
    }

    let content = "";
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        content += delta;
        yield { delta };
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens;
        outputTokens = chunk.usage.completion_tokens;
      }
    }

    return { content, inputTokens, outputTokens, model };
  }

  async generateVisionResponse(
    params: GenerateTextParams & { imageUrl: string }
  ): Promise<GenerateResult> {
    let model = process.env.OPENAI_VISION_MODEL?.trim() || getChatModel();
    const messagesWithImage: ChatMessageInput[] = params.messages.map((m, i, arr) =>
      i === arr.length - 1 && m.role === "user"
        ? { ...m, imageUrl: params.imageUrl }
        : m
    );

    let completion;
    try {
      completion = await this.client.chat.completions.create(
        {
          model,
          messages: toOpenAIMessages(buildSystemPrompt(params), messagesWithImage, "auto"),
          max_completion_tokens: params.maxOutputTokens ?? 2048,
          response_format: params.jsonSchema ? { type: "json_schema", json_schema: { ...params.jsonSchema, strict: true } } : undefined,
          reasoning_effort: params.jsonSchema && /^gpt-5/.test(model) ? "low" : undefined,
        },
        { signal: params.signal }
      );
    } catch (err) {
      if (isModelNotFoundError(err) && model !== DEFAULT_FALLBACK_MODEL) {
        console.warn(`[OpenAI Vision] Model "${model}" not found. Falling back to "${DEFAULT_FALLBACK_MODEL}".`);
        model = DEFAULT_FALLBACK_MODEL;
        completion = await this.client.chat.completions.create(
          {
            model,
            messages: toOpenAIMessages(buildSystemPrompt(params), messagesWithImage, "auto"),
            max_completion_tokens: params.maxOutputTokens ?? 2048,
            response_format: params.jsonSchema ? { type: "json_schema", json_schema: { ...params.jsonSchema, strict: true } } : undefined,
            reasoning_effort: params.jsonSchema && /^gpt-5/.test(model) ? "low" : undefined,
          },
          { signal: params.signal }
        );
      } else {
        throw err;
      }
    }

    if (params.taskPrompt && completion.choices[0]?.finish_reason === "length") {
      throw new Error("لم تكتمل معالجة المصدر؛ تجاوزت الاستجابة حد الطول، حاول تقسيم المحتوى");
    }
    return {
      content: completion.choices[0]?.message?.content ?? "",
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
      model,
    };
  }

  async *generateVisionStream(
    params: GenerateTextParams & { imageUrl: string }
  ): AsyncGenerator<StreamChunk, GenerateResult, unknown> {
    let model = process.env.OPENAI_VISION_MODEL?.trim() || getChatModel();
    const messagesWithImage: ChatMessageInput[] = params.messages.map((m, i, arr) =>
      i === arr.length - 1 && m.role === "user"
        ? { ...m, imageUrl: params.imageUrl }
        : m
    );

    let stream;
    try {
      stream = await this.client.chat.completions.create(
        {
          model,
          messages: toOpenAIMessages(buildSystemPrompt(params), messagesWithImage, "auto"),
          stream: true,
          stream_options: { include_usage: true },
          max_completion_tokens: params.maxOutputTokens ?? 2048,
        },
        { signal: params.signal }
      );
    } catch (err) {
      if (isModelNotFoundError(err) && model !== DEFAULT_FALLBACK_MODEL) {
        console.warn(`[OpenAI Vision Stream] Model "${model}" not found. Falling back to "${DEFAULT_FALLBACK_MODEL}".`);
        model = DEFAULT_FALLBACK_MODEL;
        stream = await this.client.chat.completions.create(
          {
            model,
            messages: toOpenAIMessages(buildSystemPrompt(params), messagesWithImage, "auto"),
            stream: true,
            stream_options: { include_usage: true },
            max_completion_tokens: params.maxOutputTokens ?? 2048,
          },
          { signal: params.signal }
        );
      } else {
        throw err;
      }
    }

    let content = "";
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        content += delta;
        yield { delta };
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens;
        outputTokens = chunk.usage.completion_tokens;
      }
    }

    return { content, inputTokens, outputTokens, model };
  }

  async createEmbedding(text: string): Promise<EmbeddingResult> {
    const [result] = await this.createEmbeddings([text]);
    return result;
  }

  async createEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];
    const model = getEmbeddingModel();

    const response = await this.client.embeddings.create({
      model,
      input: texts,
    });

    const tokensPerItem = Math.ceil((response.usage?.total_tokens ?? 0) / texts.length);

    return response.data.map((item) => ({
      embedding: item.embedding,
      tokens: tokensPerItem,
      model,
    }));
  }

  calculateCost(params: { model: string; inputTokens: number; outputTokens: number }): number {
    const pricing = PRICING[params.model] ?? PRICING["gpt-5.4-mini"] ?? PRICING["gpt-4o-mini"];
    return (
      (params.inputTokens / 1_000_000) * pricing.input +
      (params.outputTokens / 1_000_000) * pricing.output
    );
  }
}
