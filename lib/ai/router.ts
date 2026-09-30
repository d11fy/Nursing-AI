// Transitional API for existing study/exam features. No provider selection or fallback.
import { OpenAIProvider } from './providers/openai';
import { getAIConfig } from './config.mjs';
import type { AIProvider, AIRequest, AIResponse, ComplexityClass, GenerateTextParams, RoutingReason } from './provider';
let provider: OpenAIProvider | undefined;
export type AIProviderName = 'openai';
export function getProviderByName(name: string): AIProvider {
  if (name !== 'openai') throw new Error('Only OpenAI is enabled');
  return provider ??= new OpenAIProvider();
}
export interface RouteContext { feature?: string; complexity?: ComplexityClass; hasImage?: boolean; containsSensitiveData?: boolean; sourceConfidence?: number; preferredProvider?: string; budgetRatio?: number; privacyRestricted?: boolean }
export interface RouteDecision { provider: AIProviderName; fallbackProviders: AIProviderName[]; model: string; reason: RoutingReason }
export function routeAIRequest(ctx: RouteContext): RouteDecision {
  return { provider: 'openai', fallbackProviders: [], model: getAIConfig().chatModel,
    reason: ctx.hasImage ? 'VISION_REQUEST' : ctx.complexity === 'COMPLEX' ? 'COMPLEX_REQUEST' : 'NORMAL_REQUEST' };
}
export async function executeWithRouter(req: AIRequest, params: GenerateTextParams): Promise<AIResponse> {
  const start = Date.now(), ai = getProviderByName('openai'), result = await ai.generateText(params);
  return { ...result, provider: 'openai', estimatedCost: ai.calculateCost(result), latencyMs: Date.now() - start, fallbackUsed: false, sources: req.retrievedSources };
}
