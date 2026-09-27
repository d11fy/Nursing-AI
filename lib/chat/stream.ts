/** The server closes the response only after saving the assistant message.
 * Do not navigate to a server-rendered conversation before that point. */
export async function consumeChatResponse(
  response: Response,
  callbacks: {
    onConversationId: (id: string) => void;
    onChunk: (text: string) => void;
    onComplete: (id: string | null) => void;
  }
) {
  const id = response.headers.get("X-Conversation-Id");
  if (id) callbacks.onConversationId(id);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing chat response body");
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) callbacks.onChunk(text);
    }
    const remaining = decoder.decode();
    if (remaining) callbacks.onChunk(remaining);
  } finally {
    reader.releaseLock();
  }
  callbacks.onComplete(id);
}
