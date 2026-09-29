export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

export const PRICING_TABLE: Record<string, ModelPricing> = {
  // OpenAI
  "gpt-5.4-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  "text-embedding-3-small": { inputPerMillion: 0.02, outputPerMillion: 0 },

  // Gemini
  "gemini-2.5-flash": { inputPerMillion: 0.075, outputPerMillion: 0.3 },
  "gemini-2.0-flash": { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  "gemini-1.5-flash": { inputPerMillion: 0.075, outputPerMillion: 0.3 },
  "gemini-1.5-pro": { inputPerMillion: 1.25, outputPerMillion: 5.0 },

  // Groq
  "llama-3.3-70b-versatile": { inputPerMillion: 0.59, outputPerMillion: 0.79 },
  "llama-3.1-8b-instant": { inputPerMillion: 0.05, outputPerMillion: 0.08 },
  "qwen-2.5-32b": { inputPerMillion: 0.2, outputPerMillion: 0.2 },

  // Cloudflare Workers AI
  "@cf/meta/llama-3.1-8b-instruct": { inputPerMillion: 0.05, outputPerMillion: 0.05 },
  "@cf/meta/llama-3.3-70b-instruct": { inputPerMillion: 0.5, outputPerMillion: 0.5 },
};

export function calculateAICost(params: {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  isFreeTier?: boolean;
}): number {
  if (params.isFreeTier) return 0;

  const pricing =
    PRICING_TABLE[params.model] ||
    (params.provider === "openai"
      ? PRICING_TABLE["gpt-5.4-mini"]
      : params.provider === "gemini"
      ? PRICING_TABLE["gemini-2.5-flash"]
      : params.provider === "groq"
      ? PRICING_TABLE["llama-3.3-70b-versatile"]
      : { inputPerMillion: 0.1, outputPerMillion: 0.2 });

  const inputCost = (params.inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (params.outputTokens / 1_000_000) * pricing.outputPerMillion;
  return Number((inputCost + outputCost).toFixed(7));
}
