import type { AIProvider } from "@/lib/ai/provider";
import { OpenAIProvider } from "@/lib/ai/providers/openai";
import { getAIConfig } from "./config.mjs";

let cachedProvider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (cachedProvider) return cachedProvider;

  getAIConfig();
  cachedProvider = new OpenAIProvider();
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
