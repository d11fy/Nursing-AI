import type {
  AIProvider,
  AIRequest,
  AIResponse,
  ComplexityClass,
  GenerateResult,
  GenerateTextParams,
  RoutingReason,
  StreamChunk,
} from "@/lib/ai/provider";
import { OpenAIProvider } from "@/lib/ai/providers/openai";
import { GeminiProvider, getGeminiTextModel, getGeminiVisionModel } from "@/lib/ai/providers/gemini";
import { GroqProvider, getGroqTextModel } from "@/lib/ai/providers/groq";
import { CloudflareProvider } from "@/lib/ai/providers/cloudflare";
import { executeWithFallback, getProviderCircuitState } from "@/lib/ai/fallback";
import { calculateAICost } from "@/lib/ai/cost";

export type AIProviderName = "openai" | "gemini" | "groq" | "cloudflare";

// Cached provider instances
let openaiInstance: OpenAIProvider | null = null;
let geminiInstance: GeminiProvider | null = null;
let groqInstance: GroqProvider | null = null;
let cloudflareInstance: CloudflareProvider | null = null;

export function getProviderByName(name: AIProviderName | string): AIProvider {
  switch (name.toLowerCase()) {
    case "gemini":
      if (!geminiInstance) geminiInstance = new GeminiProvider();
      return geminiInstance;
    case "groq":
      if (!groqInstance) groqInstance = new GroqProvider();
      return groqInstance;
    case "cloudflare":
      if (!cloudflareInstance) cloudflareInstance = new CloudflareProvider();
      return cloudflareInstance;
    case "openai":
    default:
      if (!openaiInstance) openaiInstance = new OpenAIProvider();
      return openaiInstance;
  }
}

export interface RouteDecision {
  provider: AIProviderName;
  fallbackProviders: AIProviderName[];
  model: string;
  reason: RoutingReason;
}

export interface RouteContext {
  feature?: string;
  complexity?: ComplexityClass;
  hasImage?: boolean;
  containsSensitiveData?: boolean;
  sourceConfidence?: number;
  preferredProvider?: string;
  budgetRatio?: number; // e.g. 0.85 = 85% of monthly budget reached
  privacyRestricted?: boolean;
}

/**
 * Intelligent AI Router:
 * Selects the optimal AI provider based on complexity, feature type, budget,
 * privacy requirements, and circuit health.
 */
export function routeAIRequest(ctx: RouteContext): RouteDecision {
  const allowFreeTier = process.env.ALLOW_FREE_TIER_PRIVATE_CONTENT === "true";
  const isPrivacySensitive = ctx.containsSensitiveData || (ctx.privacyRestricted && !allowFreeTier);

  // 1. Privacy Restriction: Send only to trusted primary paid provider
  if (isPrivacySensitive) {
    return {
      provider: "openai",
      fallbackProviders: ["gemini"],
      model: process.env.OPENAI_TEXT_MODEL || "gpt-5.4-mini",
      reason: "PRIVACY_REQUIREMENT",
    };
  }

  // 2. Vision Request
  if (ctx.hasImage || ctx.complexity === "VISION") {
    const openaiState = getProviderCircuitState("openai");
    if (openaiState.status === "rate_limited" || openaiState.status === "degraded") {
      return {
        provider: "gemini",
        fallbackProviders: ["openai"],
        model: getGeminiVisionModel(),
        reason: "PRIMARY_RATE_LIMIT",
      };
    }
    return {
      provider: "openai",
      fallbackProviders: ["gemini"],
      model: process.env.OPENAI_VISION_MODEL || "gpt-5.4-mini",
      reason: "VISION_REQUEST",
    };
  }

  // 3. Complex Request (Clinical reasoning, pharmacology, dosage, emergency, multi-step)
  if (ctx.complexity === "COMPLEX") {
    const openaiState = getProviderCircuitState("openai");
    if (openaiState.status === "rate_limited" || openaiState.status === "degraded") {
      return {
        provider: "gemini",
        fallbackProviders: ["groq"],
        model: getGeminiTextModel(),
        reason: "PRIMARY_RATE_LIMIT",
      };
    }
    return {
      provider: "openai",
      fallbackProviders: ["gemini", "groq"],
      model: process.env.OPENAI_COMPLEX_MODEL || process.env.OPENAI_TEXT_MODEL || "gpt-5.4-mini",
      reason: "COMPLEX_REQUEST",
    };
  }

  // 4. Utility Task
  if (ctx.complexity === "UTILITY") {
    return {
      provider: "cloudflare",
      fallbackProviders: ["gemini", "groq"],
      model: "@cf/meta/llama-3.1-8b-instruct",
      reason: "UTILITY_TASK",
    };
  }

  // 5. Budget Guard: If budget reached >= 80%, route all simple/normal tasks to Economy
  const isBudgetStrained = (ctx.budgetRatio ?? 0) >= 0.8;

  // 6. Simple Request (Definitions, Flashcards, Key Points, basic MCQ)
  if (ctx.complexity === "SIMPLE" || ctx.feature === "flashcards" || ctx.feature === "key_points") {
    const geminiState = getProviderCircuitState("gemini");
    if (geminiState.status === "healthy") {
      return {
        provider: "gemini",
        fallbackProviders: ["groq", "openai"],
        model: getGeminiTextModel(),
        reason: isBudgetStrained ? "BUDGET_OPTIMIZATION" : "SIMPLE_REQUEST",
      };
    }
    const groqState = getProviderCircuitState("groq");
    if (groqState.status === "healthy") {
      return {
        provider: "groq",
        fallbackProviders: ["gemini", "openai"],
        model: getGroqTextModel(),
        reason: "PRIMARY_RATE_LIMIT",
      };
    }
    return {
      provider: "openai",
      fallbackProviders: ["gemini", "groq"],
      model: process.env.OPENAI_TEXT_MODEL || "gpt-5.4-mini",
      reason: "PROVIDER_DOWN",
    };
  }

  // 7. Normal Request (Standard curriculum explanation, summary, standard quiz)
  // When budget strained, use Gemini; otherwise check environment preference
  const primaryProviderConfig = (process.env.AI_NORMAL_PROVIDER || process.env.AI_PRIMARY_PROVIDER || "openai") as AIProviderName;

  if (isBudgetStrained || primaryProviderConfig === "gemini") {
    return {
      provider: "gemini",
      fallbackProviders: ["openai", "groq"],
      model: getGeminiTextModel(),
      reason: isBudgetStrained ? "BUDGET_OPTIMIZATION" : "NORMAL_REQUEST",
    };
  }

  return {
    provider: "openai",
    fallbackProviders: ["gemini", "groq"],
    model: process.env.OPENAI_TEXT_MODEL || "gpt-5.4-mini",
    reason: "NORMAL_REQUEST",
  };
}

/**
 * Unified execution via AI Router.
 * Resolves the optimal provider, executes with fallback, and returns normalized AIResponse.
 */
export async function executeWithRouter(
  req: AIRequest,
  params: GenerateTextParams
): Promise<AIResponse> {
  const route = routeAIRequest({
    feature: req.feature,
    complexity: req.complexity,
    hasImage: req.hasImage,
    containsSensitiveData: req.containsSensitiveData,
    sourceConfidence: req.sourceConfidence,
    preferredProvider: req.preferredProvider,
  });

  const primary = getProviderByName(route.provider);
  const fallbacks = route.fallbackProviders.map(getProviderByName);

  const start = Date.now();
  const { result, providerUsed, fallbackUsed, fallbackFrom, fallbackReason } =
    await executeWithFallback({
      primaryProvider: primary,
      fallbackProviders: fallbacks,
      operation: (p) => p.generateText(params),
      operationName: `${req.feature} via Router`,
    });

  const latencyMs = Date.now() - start;
  const estimatedCost = calculateAICost({
    provider: providerUsed,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  return {
    content: result.content,
    provider: providerUsed,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    estimatedCost,
    latencyMs,
    fallbackUsed,
    fallbackFrom,
    fallbackReason,
    sources: req.retrievedSources,
  };
}
