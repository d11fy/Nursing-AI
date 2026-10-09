import { chatErrorMessage, type ChatErrorCode } from "./errors";

/** The server reported a failure in the event stream (the answer was NOT saved). */
export class ChatStreamError extends Error {
  constructor(message: string, readonly code: ChatErrorCode = "INTERNAL", readonly retryable = true, readonly generationId?: string) {
    super(message);
    this.name = "ChatStreamError";
  }
}
/**
 * The connection ended before the server confirmed the answer was saved. The answer may still be generated
 * and stored on the server: callers must check the generation instead of showing an error.
 */
export class ChatStreamInterrupted extends ChatStreamError {
  constructor(message = "انقطع الاتصال قبل حفظ الإجابة؛ جارٍ التحقق منها.", readonly requestId?: string, options?: { cause?: unknown }) {
    super(message, "STREAM_INTERRUPTED", true);
    this.name = "ChatStreamInterrupted";
    if (options?.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
  }
}

export type ChatStartedInfo = { generationId?: string; requestId?: string; conversationId?: string; userMessageId?: string | null };

/** The server closes the response only after saving the assistant message.
 * Do not navigate to a server-rendered conversation before that point. */
export async function consumeChatResponse(
  response: Response,
  callbacks: {
    onConversationId: (id: string) => void;
    onChunk: (text: string) => void;
    onComplete: (id: string | null) => void;
    onMessageIds?: (assistantId: string, userId: string) => void;
    onStarted?: (info: ChatStartedInfo) => void;
    /** Called for every network read, including server keep-alive comments. */
    onActivity?: () => void;
  },
  options: { stallMs?: number; requestId?: string } = {},
) {
  const id = response.headers.get("X-Conversation-Id");
  if (id) callbacks.onConversationId(id);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing chat response body");
  const decoder = new TextDecoder();
  const sse = response.headers
    .get("Content-Type")
    ?.includes("text/event-stream");
  let buffer = "",
    persisted = false;
  function consume(text: string) {
    if (!sse) {
      callbacks.onChunk(text);
      return;
    }
    buffer = (buffer + text).replace(/\r\n/g, "\n");
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const kind = event.match(/^event:\s*(.+)$/m)?.[1]?.trim(),
        data = event.match(/^data:\s*(.+)$/m)?.[1];
      // Comment lines (": keepalive") carry no data and only prove the connection is alive.
      if (!data) continue;
      const payload = JSON.parse(data);
      if (kind === "started") callbacks.onStarted?.(payload);
      if (kind === "delta") callbacks.onChunk(payload.text);
      if (kind === "error") {
        const code: ChatErrorCode = payload.code ?? "INTERNAL";
        throw new ChatStreamError(payload.error || chatErrorMessage(code), code, payload.retryable !== false, payload.generationId);
      }
      if (kind === "persisted") {
        persisted = true;
        callbacks.onMessageIds?.(payload.messageId, payload.userMessageId);
      }
    }
  }
  const readWithStall = async () => {
    if (!options.stallMs) return reader.read();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stalled = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ChatStreamInterrupted("توقف وصول الإجابة؛ جارٍ التحقق منها.", options.requestId)), options.stallMs);
    });
    try { return await Promise.race([reader.read(), stalled]); } finally { if (timer) clearTimeout(timer); }
  };
  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await readWithStall();
      } catch (error) {
        if (error instanceof ChatStreamError) { void reader.cancel().catch(() => undefined); throw error; }
        // A user abort is not an interruption; any other read failure on an event stream is (the phone lost the network).
        if (!sse || (error instanceof DOMException && error.name === "AbortError")) throw error;
        throw new ChatStreamInterrupted(undefined, options.requestId, { cause: error });
      }
      const { done, value } = chunk;
      if (done) break;
      callbacks.onActivity?.();
      const text = decoder.decode(value, { stream: true });
      if (text) consume(text);
    }
    const remaining = decoder.decode();
    if (remaining) consume(remaining);
  } finally {
    try { reader.releaseLock(); } catch { /* a read that lost a stall race is still pending */ }
  }
  if (sse && !persisted) throw new ChatStreamInterrupted(undefined, options.requestId);
  callbacks.onComplete(id);
}
