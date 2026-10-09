// One question, end to end, for both the website and the Android app:
//   send (with a request id) -> stream -> if the connection drops, ask the server what happened -> show the saved answer.
// The server owns the answer; this module only mirrors it. Re-sending the same request id is always safe.
import { ChatStreamError, ChatStreamInterrupted, consumeChatResponse, type ChatStartedInfo } from "./stream";
import { recoverGeneration, type GenerationSnapshot } from "./recovery";
import { chatErrorMessage, isNetworkFailure, type ChatErrorCode } from "./errors";

export type ChatTransport = {
  start(body: Record<string, unknown>, signal: AbortSignal): Promise<Response>;
  status(requestId: string, signal?: AbortSignal): Promise<GenerationSnapshot>;
  /** Stop button: asks the server to cancel. A dropped connection never calls this. */
  cancel?(requestId: string): Promise<void>;
};
export type TurnPhase = "sending" | "streaming" | "recovering" | "waiting" | "offline";
export type TurnCallbacks = {
  /** The accepted response (headers such as X-Subject-Id), before any text arrives. */
  onResponse?(response: Response): void;
  onStarted?(info: ChatStartedInfo): void;
  onConversationId?(id: string): void;
  onChunk(text: string): void;
  onMessageIds?(assistantId: string, userMessageId: string): void;
  onPhase?(phase: TurnPhase): void;
  /** The text the server saved. After a recovery it replaces whatever was partially streamed. */
  onFinal?(message: { id: string; content: string; userMessageId: string | null }): void;
};
export type TurnResult =
  | { outcome: "completed"; recovered: boolean; conversationId: string | null }
  /** The server refused the request (usage limit, file still processing...). Nothing was generated. */
  | { outcome: "rejected"; status: number; error: string; code?: string; data: Record<string, unknown> }
  | { outcome: "failed"; code: ChatErrorCode; message: string; retryable: boolean }
  /** Still being generated on the server; the answer will be in the conversation history. */
  | { outcome: "pending"; message: string }
  | { outcome: "aborted" };

const isAbort = (error: unknown) => (error instanceof DOMException && error.name === "AbortError") || (error instanceof Error && error.name === "AbortError");

export function newRequestId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes); else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function runChatTurn(input: {
  transport: ChatTransport;
  body: Record<string, unknown> & { requestId: string };
  signal: AbortSignal;
  callbacks: TurnCallbacks;
  stallMs?: number;
  recovery?: { maxWaitMs?: number; intervalMs?: number; now?: () => number; sleep?: (ms: number, signal?: AbortSignal) => Promise<void> };
}): Promise<TurnResult> {
  const { transport, body, signal, callbacks } = input;
  let conversationId: string | null = null;

  async function recover(): Promise<TurnResult> {
    callbacks.onPhase?.("recovering");
    const result = await recoverGeneration({
      requestId: body.requestId, signal, fetchStatus: (id) => transport.status(id, signal), ...input.recovery,
      onPhase: (phase) => callbacks.onPhase?.(phase === "checking" ? "recovering" : phase),
    });
    if (result.outcome === "completed") {
      conversationId = result.conversationId ?? conversationId;
      callbacks.onFinal?.({ id: result.message.id, content: result.message.content, userMessageId: result.userMessageId });
      if (result.userMessageId) callbacks.onMessageIds?.(result.message.id, result.userMessageId);
      return { outcome: "completed", recovered: true, conversationId };
    }
    if (result.outcome === "failed") return { outcome: "failed", code: result.code, message: result.message, retryable: true };
    if (result.outcome === "not_found") return { outcome: "failed", code: "GENERATION_NOT_FOUND", message: chatErrorMessage("GENERATION_NOT_FOUND"), retryable: true };
    if (result.outcome === "offline") return { outcome: "failed", code: "NETWORK_OFFLINE", message: chatErrorMessage("NETWORK_OFFLINE"), retryable: true };
    if (result.outcome === "pending") return { outcome: "pending", message: chatErrorMessage("GENERATION_IN_PROGRESS") };
    return { outcome: "aborted" };
  }

  callbacks.onPhase?.("sending");
  let response: Response;
  try {
    response = await transport.start(body, signal);
  } catch (error) {
    if (isAbort(error) || signal.aborted) return { outcome: "aborted" };
    // The request may or may not have reached the server: ask, then either show the answer or allow a safe re-send.
    return recover();
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { outcome: "rejected", status: response.status, error: String(data.error ?? chatErrorMessage("INTERNAL")), code: typeof data.code === "string" ? data.code : undefined, data };
  }
  callbacks.onResponse?.(response);
  try {
    callbacks.onPhase?.("streaming");
    await consumeChatResponse(response, {
      onConversationId: (id) => { conversationId = id; callbacks.onConversationId?.(id); },
      onChunk: callbacks.onChunk,
      onStarted: callbacks.onStarted,
      onMessageIds: callbacks.onMessageIds,
      onComplete: () => undefined,
    }, { stallMs: input.stallMs, requestId: body.requestId });
    return { outcome: "completed", recovered: false, conversationId };
  } catch (error) {
    if (isAbort(error) || signal.aborted) return { outcome: "aborted" };
    if (error instanceof ChatStreamInterrupted || (!(error instanceof ChatStreamError) && isNetworkFailure(error))) return recover();
    if (error instanceof ChatStreamError) return { outcome: "failed", code: error.code, message: error.message, retryable: error.retryable };
    return { outcome: "failed", code: "INTERNAL", message: chatErrorMessage("INTERNAL"), retryable: true };
  }
}
