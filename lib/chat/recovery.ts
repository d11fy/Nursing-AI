import { chatErrorMessage, isNetworkFailure, type ChatErrorCode } from "./errors";

export type GenerationState = "pending" | "streaming" | "completed" | "failed" | "cancelled" | "not_found";
export type GenerationSnapshot = {
  status: GenerationState;
  conversationId?: string;
  userMessageId?: string | null;
  assistantMessage?: { id: string; content: string } | null;
  error?: { code: ChatErrorCode; message: string } | null;
};

export type RecoveryOutcome =
  | { outcome: "completed"; message: { id: string; content: string }; userMessageId: string | null; conversationId: string | null }
  | { outcome: "failed"; code: ChatErrorCode; message: string }
  /** The server never saw the question: sending it again is safe and costs nothing extra. */
  | { outcome: "not_found" }
  /** Still generating after the wait budget; the answer will appear in the conversation history. */
  | { outcome: "pending" }
  /** Every check failed for lack of a network: nothing is known about the answer yet. */
  | { outcome: "offline" }
  | { outcome: "aborted" };

const defaultSleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  const timer = setTimeout(() => { signal?.removeEventListener("abort", done); resolve(); }, ms);
  const done = () => { clearTimeout(timer); resolve(); };
  signal?.addEventListener("abort", done, { once: true });
});

/**
 * After a dropped stream, ask the server what happened to this request id instead of showing an error.
 * Network errors while asking just mean "still offline": keep waiting until the budget is spent.
 */
export async function recoverGeneration(options: {
  requestId: string;
  fetchStatus: (requestId: string) => Promise<GenerationSnapshot>;
  signal?: AbortSignal;
  maxWaitMs?: number;
  intervalMs?: number;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  onPhase?: (phase: "checking" | "waiting" | "offline") => void;
}): Promise<RecoveryOutcome> {
  const { requestId, fetchStatus, signal } = options;
  const now = options.now ?? Date.now, sleep = options.sleep ?? defaultSleep;
  const deadline = now() + (options.maxWaitMs ?? 90_000);
  let delay = options.intervalMs ?? 1200;
  let lastCheckOffline = false;
  options.onPhase?.("checking");
  while (!signal?.aborted) {
    try {
      const snapshot = await fetchStatus(requestId);
      if (snapshot.status === "completed" && snapshot.assistantMessage)
        return { outcome: "completed", message: snapshot.assistantMessage, userMessageId: snapshot.userMessageId ?? null, conversationId: snapshot.conversationId ?? null };
      if (snapshot.status === "not_found") return { outcome: "not_found" };
      if (snapshot.status === "failed" || snapshot.status === "cancelled") {
        const code = snapshot.error?.code ?? "INTERNAL";
        return { outcome: "failed", code, message: snapshot.error?.message ?? chatErrorMessage(code) };
      }
      lastCheckOffline = false;
      options.onPhase?.("waiting");
    } catch (error) {
      if (signal?.aborted) break;
      // An unexpected server answer (for example 5xx) is treated like "not yet": the budget below bounds it.
      lastCheckOffline = isNetworkFailure(error);
      options.onPhase?.(lastCheckOffline ? "offline" : "waiting");
    }
    if (now() >= deadline) return { outcome: lastCheckOffline ? "offline" : "pending" };
    await sleep(delay, signal);
    delay = Math.min(delay * 1.5, 5000);
  }
  return { outcome: "aborted" };
}
