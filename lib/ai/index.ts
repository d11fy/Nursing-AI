import type { AIProvider } from "@/lib/ai/provider";
import { OpenAIProvider } from "@/lib/ai/providers/openai";
import { OllamaProvider } from "@/lib/ai/providers/ollama";
import { getAIConfig } from "./config.mjs";

let cachedProvider: AIProvider | null = null;

/**
 * Returns the active AI provider based on `AI_PROVIDER`. Add a new case
 * (e.g. `lib/ai/providers/gemini.ts`, `lib/ai/providers/anthropic.ts`)
 * to extend without touching any call site.
 */
export function getAIProvider(): AIProvider {
  if (cachedProvider) return cachedProvider;

  const providerName = getAIConfig().provider;

  switch (providerName) {
    case "ollama":
      cachedProvider = new OllamaProvider();
      break;
    case "openai":
      cachedProvider = new OpenAIProvider();
      break;
    default:
      throw new Error(`Unknown AI_PROVIDER: ${providerName}`);
  }

  return cachedProvider;
}

export type {
  AIProvider,
  ChatMessageInput,
  GenerateResult,
  GenerateTextParams,
  KnowledgeChunk,
  StreamChunk,
} from "@/lib/ai/provider";
