// Shared by Next.js and the production startup script. Never sent to the browser.
/** @param {Record<string, string | undefined>} env */
export function getAIConfig(env = process.env) {
  const provider = env.AI_PRIMARY_PROVIDER?.trim() || env.AI_PROVIDER?.trim() || "openai";
  const chatModel = env.OPENAI_TEXT_MODEL?.trim() || env.OPENAI_CHAT_MODEL?.trim() || "gpt-5.4-mini";
  const embeddingModel = env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";

  return {
    provider,
    chatModel,
    embeddingModel,
    primaryProvider: env.AI_PRIMARY_PROVIDER?.trim() || "openai",
    economyProvider: env.AI_ECONOMY_PROVIDER?.trim() || "gemini",
    fastProvider: env.AI_FAST_PROVIDER?.trim() || "groq",
    utilityProvider: env.AI_UTILITY_PROVIDER?.trim() || "cloudflare",
    fallbackEnabled: env.AI_FALLBACK_ENABLED !== "false",
  };
}

