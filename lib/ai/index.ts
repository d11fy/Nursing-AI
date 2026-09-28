import type { AIProvider } from "@/lib/ai/provider";
import { OpenAIProvider } from "@/lib/ai/providers/openai";
import { OllamaProvider } from "@/lib/ai/providers/ollama";
import { getAIConfig } from "./config.mjs";

let cachedProvider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (cachedProvider) return cachedProvider;

  const config = getAIConfig();
  cachedProvider = config.provider === "ollama" ? new OllamaProvider() : new OpenAIProvider();
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
