// Shared by Next.js and the production startup script. Never sent to the browser.
/** @param {Record<string, string | undefined>} env */
export function getAIConfig(env = process.env) {
  const provider = "openai";
  const chatModel = env.OPENAI_MAIN_MODEL?.trim() || "gpt-6-luna";
  const embeddingModel = env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
  if (env.AI_PROVIDER && env.AI_PROVIDER !== 'openai') throw new Error('AI_PROVIDER must be openai');
  if (chatModel !== 'gpt-6-luna') throw new Error('OPENAI_MAIN_MODEL must be gpt-6-luna');
  if (embeddingModel !== 'text-embedding-3-small') throw new Error('OPENAI_EMBEDDING_MODEL must be text-embedding-3-small');

  return {
    provider,
    chatModel,
    embeddingModel,
    primaryProvider: 'openai',
    fallbackEnabled: false,
  };
}
