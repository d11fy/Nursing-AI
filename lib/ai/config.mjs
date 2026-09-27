// Shared by Next.js and the production startup script. Never sent to the browser.
/** @param {Record<string, string | undefined>} env */
export function getAIConfig(env = process.env) {
  const provider = env.AI_PROVIDER?.trim() || "openai";
  if (!["openai", "ollama"].includes(provider)) throw new Error("AI_PROVIDER must be openai or ollama");
  if (provider === "openai") {
    if (!env.OPENAI_API_KEY?.trim()) throw new Error("OPENAI_API_KEY is required when AI_PROVIDER=openai");
    return { provider, embeddingModel: env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small" };
  }
  const base = env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  let url;
  try { url = new URL(base); } catch { throw new Error("OLLAMA_BASE_URL must be a valid HTTP URL"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("OLLAMA_BASE_URL must be an HTTP(S) URL without credentials, query or fragment");
  }
  const chatModel = (env.OLLAMA_CHAT_MODEL ?? "qwen2.5:3b").trim();
  const embeddingModel = (env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text").trim();
  if (!chatModel || !embeddingModel) throw new Error("OLLAMA_CHAT_MODEL and OLLAMA_EMBEDDING_MODEL must not be empty");
  return { provider, baseUrl: url.href.replace(/\/$/, ""), chatModel, embeddingModel };
}
