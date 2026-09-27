import OpenAI from "openai";
import type {
  AIProvider,
  ChatMessageInput,
  EmbeddingResult,
  GenerateResult,
  GenerateTextParams,
  StreamChunk,
} from "@/lib/ai/provider";
import { NURSING_SYSTEM_PROMPT, buildKnowledgeContext } from "@/lib/ai/system-prompt";

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
const VISION_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

// USD per 1M tokens. Update if OpenAI pricing changes.
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
};

function toOpenAIMessages(
  systemPrompt: string,
  messages: ChatMessageInput[]
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const m of messages) {
    if (m.imageUrl) {
      result.push({
        role: "user",
        content: [
          { type: "text", text: m.content },
          { type: "image_url", image_url: { url: m.imageUrl } },
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
  return NURSING_SYSTEM_PROMPT + knowledge;
}

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({ apiKey: apiKey ?? process.env.OPENAI_API_KEY });
  }

  async generateText(params: GenerateTextParams): Promise<GenerateResult> {
    const completion = await this.client.chat.completions.create(
      {
        model: CHAT_MODEL,
        messages: toOpenAIMessages(buildSystemPrompt(params), params.messages),
      },
      { signal: params.signal }
    );

    return {
      content: completion.choices[0]?.message?.content ?? "",
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
      model: CHAT_MODEL,
    };
  }

  async *generateStream(
    params: GenerateTextParams
  ): AsyncGenerator<StreamChunk, GenerateResult, unknown> {
    const stream = await this.client.chat.completions.create(
      {
        model: CHAT_MODEL,
        messages: toOpenAIMessages(buildSystemPrompt(params), params.messages),
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal: params.signal }
    );

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

    return { content, inputTokens, outputTokens, model: CHAT_MODEL };
  }

  async generateVisionResponse(
    params: GenerateTextParams & { imageUrl: string }
  ): Promise<GenerateResult> {
    const messagesWithImage: ChatMessageInput[] = params.messages.map((m, i, arr) =>
      i === arr.length - 1 && m.role === "user"
        ? { ...m, imageUrl: params.imageUrl }
        : m
    );

    const completion = await this.client.chat.completions.create(
      {
        model: VISION_MODEL,
        messages: toOpenAIMessages(buildSystemPrompt(params), messagesWithImage),
      },
      { signal: params.signal }
    );

    return {
      content: completion.choices[0]?.message?.content ?? "",
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
      model: VISION_MODEL,
    };
  }

  async createEmbedding(text: string): Promise<EmbeddingResult> {
    const [result] = await this.createEmbeddings([text]);
    return result;
  }

  async createEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    const response = await this.client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
    });

    const tokensPerItem = Math.ceil((response.usage?.total_tokens ?? 0) / texts.length);

    return response.data.map((item) => ({
      embedding: item.embedding,
      tokens: tokensPerItem,
      model: EMBEDDING_MODEL,
    }));
  }

  calculateCost(params: { model: string; inputTokens: number; outputTokens: number }): number {
    const pricing = PRICING[params.model] ?? PRICING["gpt-4o-mini"];
    return (
      (params.inputTokens / 1_000_000) * pricing.input +
      (params.outputTokens / 1_000_000) * pricing.output
    );
  }
}
