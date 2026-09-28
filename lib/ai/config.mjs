// Shared by Next.js and the production startup script. Never sent to the browser.
/** @param {Record<string, string | undefined>} env */
export function getAIConfig(env = process.env) {
  const provider = env.AI_PROVIDER?.trim() || "openai";
  if (!['openai', 'ollama'].includes(provider)) throw new Error("AI_PROVIDER must be openai or ollama");
  if (provider === "openai" && !env.OPENAI_API_KEY?.trim()) throw new Error("OPENAI_API_KEY is required when AI_PROVIDER=openai");
  if (provider === "ollama") return { provider: "ollama", chatModel: env.OLLAMA_CHAT_MODEL?.trim() || "qwen2.5:3b", embeddingModel: env.OLLAMA_EMBEDDING_MODEL?.trim() || "nomic-embed-text", baseUrl: (env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434").replace(/\/$/, "") };

  const chatModel = env.OPENAI_CHAT_MODEL?.trim() || "gpt-5.4-mini";
  const embeddingModel = env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";

  return {
    provider: "openai",
    chatModel,
    embeddingModel,
  };
}
