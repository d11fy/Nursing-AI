import Groq from "groq-sdk";
import type {
  AIProvider,
  ChatMessageInput,
  EmbeddingResult,
  GenerateResult,
  GenerateTextParams,
  ProviderHealth,
  StreamChunk,
} from "@/lib/ai/provider";
import { OpenAIProvider } from "@/lib/ai/providers/openai";
import { NURSING_SYSTEM_PROMPT, buildKnowledgeContext } from "@/lib/ai/system-prompt";
import { calculateAICost } from "@/lib/ai/cost";

export function getGroqTextModel(): string {
  return process.env.GROQ_TEXT_MODEL?.trim() || "llama-3.3-70b-versatile";
}

function buildGroqSystemPrompt(params: GenerateTextParams): string {
  const knowledge = params.knowledge?.length
    ? buildKnowledgeContext(params.knowledge)
    : "";
  const personalization = params.personalizationContext
    ? `\n\nStudent personalization context (not an academic source):\n${params.personalizationContext}`
    : "";
  return (params.taskPrompt ?? NURSING_SYSTEM_PROMPT) + personalization + knowledge;
}

export class GroqProvider implements AIProvider {
  readonly name: string = "groq";
  private client: Groq | null = null;
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.GROQ_API_KEY?.trim() ?? "";
    if (this.apiKey && this.apiKey !== "placeholder") {
      this.client = new Groq({ apiKey: this.apiKey });
    }
  }

  private getClient(): Groq {
    if (this.client) return this.client;
    const key = this.apiKey || process.env.GROQ_API_KEY?.trim() || "";
    if (!key || key === "placeholder") {
      throw new Error("GROQ_API_KEY is not configured or invalid.");
    }
    this.client = new Groq({ apiKey: key });
    return this.client;
  }

  async isAvailable(): Promise<boolean> {
    const key = this.apiKey || process.env.GROQ_API_KEY?.trim();
    return Boolean(key && key !== "placeholder");
  }

  async healthCheck(): Promise<ProviderHealth> {
    const key = this.apiKey || process.env.GROQ_API_KEY?.trim();
    if (!key || key === "placeholder") {
      return {
        provider: "groq",
        status: "disabled",
        lastChecked: new Date().toISOString(),
        lastError: "GROQ_API_KEY is not configured",
      };
    }

    const start = Date.now();
    try {
      const client = this.getClient();
      const model = getGroqTextModel();
      const response = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      });
      return {
        provider: "groq",
        status: "healthy",
        latencyMs: Date.now() - start,
        model: response.model || model,
        lastChecked: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit = msg.toLowerCase().includes("rate limit") || msg.includes("429");
      return {
        provider: "groq",
        status: isRateLimit ? "rate_limited" : "offline",
        latencyMs: Date.now() - start,
        lastError: msg,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  async generateText(params: GenerateTextParams): Promise<GenerateResult> {
    const client = this.getClient();
    const model = getGroqTextModel();
    const systemPrompt = buildGroqSystemPrompt(params);

    const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...params.messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
    ];

    const response = await client.chat.completions.create({
      model,
      messages,
      max_tokens: params.maxOutputTokens,
      response_format: params.jsonSchema ? { type: "json_object" } : undefined,
    });

    const content = response.choices[0]?.message?.content ?? "";
    return {
      content,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      model,
    };
  }

  async *generateStream(
    params: GenerateTextParams
  ): AsyncGenerator<StreamChunk, GenerateResult, unknown> {
    const client = this.getClient();
    const model = getGroqTextModel();
    const systemPrompt = buildGroqSystemPrompt(params);

    const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...params.messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
    ];

    const stream = await client.chat.completions.create({
      model,
      messages,
      stream: true,
      max_tokens: params.maxOutputTokens,
    });

    let content = "";
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        content += delta;
        yield { delta };
      }
      if (chunk.x_groq?.usage) {
        inputTokens = chunk.x_groq.usage.prompt_tokens;
        outputTokens = chunk.x_groq.usage.completion_tokens;
      }
    }

    return { content, inputTokens, outputTokens, model };
  }

  async generateVisionResponse(
    params: GenerateTextParams & { imageUrl: string }
  ): Promise<GenerateResult> {
    const openai = new OpenAIProvider();
    return openai.generateVisionResponse(params);
  }

  async createEmbedding(text: string): Promise<EmbeddingResult> {
    const [res] = await this.createEmbeddings([text]);
    return res;
  }

  async createEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    const openai = new OpenAIProvider();
    return openai.createEmbeddings(texts);
  }

  calculateCost(params: { model: string; inputTokens: number; outputTokens: number }): number {
    return calculateAICost({
      provider: "groq",
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
    });
  }
}
