// Standard tier, <=272K input tokens. Verified 2026-09-30 against official model pricing.
export const PRICING_VERSION = 'openai-standard-2026-09-30';
export const PRICING_TABLE = {
  'gpt-6-luna': { inputPerMillion: 0.10, cachedInputPerMillion: 0.01, outputPerMillion: 0.50 },
  'text-embedding-3-small': { inputPerMillion: 0.02, cachedInputPerMillion: 0.02, outputPerMillion: 0 },
};
export function calculateAICost(params: { provider: string; model: string; inputTokens: number; outputTokens: number; cachedInputTokens?: number; isFreeTier?: boolean }): number {
  const model = params.model.startsWith('gpt-6-luna') ? 'gpt-6-luna' : params.model;
  const price = PRICING_TABLE[model as keyof typeof PRICING_TABLE];
  if (params.provider !== 'openai' || !price) throw new Error(`Unknown pricing for ${params.provider}/${params.model}`);
  const cached = Math.min(params.inputTokens, Math.max(0, params.cachedInputTokens ?? 0));
  return Number((((params.inputTokens - cached) * price.inputPerMillion + cached * price.cachedInputPerMillion + params.outputTokens * price.outputPerMillion) / 1_000_000).toFixed(9));
}
