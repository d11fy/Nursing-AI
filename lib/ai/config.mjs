// Shared by Next.js and the production startup script. Never sent to the browser.
/** @param {Record<string, string | undefined>} env */
export function getAIConfig(env = process.env) {
  const provider = env.AI_PROVIDER?.trim() || "openai";
  if (provider !== "openai") throw new Error("AI_PROVIDER must be openai");
  if (!env.OPENAI_API_KEY?.trim()) throw new Error("OPENAI_API_KEY is required when AI_PROVIDER=openai");

  const chatModel = env.OPENAI_CHAT_MODEL?.trim() || "gpt-5.4-mini";
  const embeddingModel = env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";

  return {
    provider: "openai",
    chatModel,
    embeddingModel,
  };
}
