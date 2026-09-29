import type { AIProvider } from "@/lib/ai/provider";
import { getProviderByName } from "@/lib/ai/router";
import { getAIConfig } from "./config.mjs";

let cachedProvider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (cachedProvider) return cachedProvider;

  const config = getAIConfig();
  cachedProvider = getProviderByName(config.primaryProvider);
  return cachedProvider;
}

export { routeAIRequest, getProviderByName, executeWithRouter } from "@/lib/ai/router";
export { classifyRequest, classifyLocally, isMedicalSensitive } from "@/lib/ai/classifier";
export { executeWithFallback, getProviderCircuitState } from "@/lib/ai/fallback";
export { calculateAICost } from "@/lib/ai/cost";

export type {
  AIProvider,
  AIRequest,
  AIResponse,
  ChatMessageInput,
  ComplexityClass,
  EmbeddingResult,
  GenerateResult,
  GenerateTextParams,
  KnowledgeChunk,
  ProviderHealth,
  RoutingReason,
  StreamChunk,
} from "@/lib/ai/provider";
