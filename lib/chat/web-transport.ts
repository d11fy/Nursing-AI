import type { ChatTransport } from "./turn";
import type { GenerationSnapshot } from "./recovery";

/** Browser transport for lib/chat/turn.ts (same-origin cookies authenticate the request). */
export const webChatTransport: ChatTransport = {
  start: (body, signal) =>
    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", "Idempotency-Key": String(body.requestId) },
      body: JSON.stringify(body),
      signal,
    }),
  async status(requestId, signal) {
    const response = await fetch(`/api/chat/generations/${requestId}`, { signal, cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (response.status === 404 && data?.status === "not_found") return { status: "not_found" };
    if (!response.ok || !data) throw new Error(data?.error || `status ${response.status}`);
    return data as GenerationSnapshot;
  },
  async cancel(requestId) {
    await fetch(`/api/chat/generations/${requestId}`, { method: "DELETE" }).catch(() => undefined);
  },
};
