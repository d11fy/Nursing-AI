import { test } from "node:test";
import assert from "node:assert/strict";
import { newRequestId, runChatTurn, type ChatTransport, type TurnPhase } from "../lib/chat/turn";
import { recoverGeneration, type GenerationSnapshot } from "../lib/chat/recovery";
import { consumeChatResponse, ChatStreamInterrupted } from "../lib/chat/stream";
import { fileSnapshot } from "../lib/chat/file-status";
import { classifyProcessingError, isNetworkFailure } from "../lib/chat/errors";
import { sendMessageSchema } from "../lib/validations/chat";

const encoder = new TextEncoder();
const sse = (events: Array<[string, unknown] | string>) => events.map((event) => (typeof event === "string" ? event : `event: ${event[0]}\ndata: ${JSON.stringify(event[1])}\n\n`)).join("");
const sseResponse = (events: Array<[string, unknown] | string>, options: { dropAfter?: boolean } = {}) => new Response(new ReadableStream({
  start(controller) {
    controller.enqueue(encoder.encode(sse(events)));
    if (options.dropAfter) setTimeout(() => controller.error(new TypeError("network error")), 5); else controller.close();
  },
}), { headers: { "Content-Type": "text/event-stream", "X-Conversation-Id": "conversation-1" } });
const requestId = "11111111-1111-4111-8111-111111111111";
const noSleep = async () => undefined;
const saved: GenerationSnapshot = { status: "completed", conversationId: "conversation-1", userMessageId: "user-1", assistantMessage: { id: "assistant-1", content: "الإجابة الكاملة المحفوظة" } };
const harness = (overrides: Partial<ChatTransport> = {}) => {
  const log = { statusCalls: 0, phases: [] as TurnPhase[], chunks: "", final: null as null | { id: string; content: string }, ids: null as null | string[] };
  const transport: ChatTransport = { start: async () => sseResponse([]), status: async () => { log.statusCalls++; return saved; }, ...overrides };
  const callbacks = { onChunk: (t: string) => { log.chunks += t; }, onPhase: (p: TurnPhase) => log.phases.push(p), onFinal: (m: { id: string; content: string }) => { log.final = m; },
    onMessageIds: (a: string, u: string) => { log.ids = [a, u]; } };
  return { log, transport, callbacks, controller: new AbortController() };
};

test("a connection dropped mid-answer is recovered from the server instead of showing an error", async () => {
  const { log, transport, callbacks, controller } = harness({
    start: async () => sseResponse([["started", { requestId }], ["delta", { text: "جزء من الإجابة" }]], { dropAfter: true }),
  });
  let polls = 0;
  transport.status = async () => { log.statusCalls++; return polls++ < 2 ? { status: "streaming" } : saved; };
  const result = await runChatTurn({ transport, body: { requestId, content: "سؤال" }, signal: controller.signal, callbacks, recovery: { sleep: noSleep } });
  assert.deepEqual(result, { outcome: "completed", recovered: true, conversationId: "conversation-1" });
  assert.equal(log.chunks, "جزء من الإجابة");
  assert.deepEqual(log.final, { id: "assistant-1", content: "الإجابة الكاملة المحفوظة", userMessageId: "user-1" });
  assert.deepEqual(log.ids, ["assistant-1", "user-1"]);
  assert.equal(log.statusCalls, 3);
  assert.ok(log.phases.includes("recovering"));
});

test("a stream that ends without the saved-answer marker is treated as interrupted, then recovered", async () => {
  const { log, transport, callbacks, controller } = harness({ start: async () => sseResponse([["delta", { text: "x" }]]) });
  const result = await runChatTurn({ transport, body: { requestId }, signal: controller.signal, callbacks, recovery: { sleep: noSleep } });
  assert.equal(result.outcome, "completed");
  assert.equal(log.statusCalls, 1);
});

test("a silent dead connection (no bytes, not even keep-alives) is detected by the stall timer", async () => {
  const hanging = new Response(new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(sse([["delta", { text: "بداية" }]]))); } }), { headers: { "Content-Type": "text/event-stream" } });
  const { log, transport, callbacks, controller } = harness({ start: async () => hanging });
  const result = await runChatTurn({ transport, body: { requestId }, signal: controller.signal, callbacks, stallMs: 30, recovery: { sleep: noSleep } });
  assert.equal(result.outcome, "completed");
  assert.equal(log.statusCalls, 1);
});

test("keep-alive comments are ignored but prove the connection is alive", async () => {
  let activity = 0, text = "";
  await consumeChatResponse(sseResponse([": keepalive\n\n", ["delta", { text: "ok" }], ": keepalive\n\n", ["persisted", { messageId: "a", userMessageId: "u" }]]),
    { onConversationId() {}, onChunk(t) { text += t; }, onComplete() {}, onActivity() { activity++; } });
  assert.equal(text, "ok");
  assert.ok(activity >= 1);
});

test("if the question never reached the server, the result says a safe re-send is possible", async () => {
  const { transport, callbacks, controller } = harness({ start: async () => { throw new TypeError("Failed to fetch"); }, status: async () => ({ status: "not_found" }) });
  const result = await runChatTurn({ transport, body: { requestId }, signal: controller.signal, callbacks, recovery: { sleep: noSleep } });
  assert.deepEqual(result, { outcome: "failed", code: "GENERATION_NOT_FOUND", message: "لم يصل السؤال إلى الخادم، أعد الإرسال", retryable: true });
});

test("staying offline for the whole wait reports the network, not a broken answer", async () => {
  let clock = 0;
  const { transport, callbacks, controller } = harness({ start: async () => { throw new TypeError("Failed to fetch"); }, status: async () => { throw new TypeError("Failed to fetch"); } });
  const result = await runChatTurn({ transport, body: { requestId }, signal: controller.signal, callbacks,
    recovery: { maxWaitMs: 20_000, now: () => clock, sleep: async (ms) => { clock += ms; } } });
  const outcome = await recoverGeneration({ requestId, fetchStatus: async () => { throw new TypeError("Failed to fetch"); }, now: () => clock, maxWaitMs: 10, sleep: async (ms) => { clock += ms; } });
  assert.equal(result.outcome, "failed");
  assert.equal(result.outcome === "failed" && result.code, "NETWORK_OFFLINE");
  assert.equal(outcome.outcome, "offline");
});

test("an answer still being generated after the wait budget is reported as pending, not failed", async () => {
  let clock = 0;
  const { transport, callbacks, controller } = harness({ start: async () => sseResponse([], { dropAfter: true }), status: async () => ({ status: "streaming" }) });
  const result = await runChatTurn({ transport, body: { requestId }, signal: controller.signal, callbacks, recovery: { maxWaitMs: 5000, now: () => clock, sleep: async (ms) => { clock += ms; } } });
  assert.equal(result.outcome, "pending");
});

test("a failure reported by the server is shown without polling; a refusal is passed through", async () => {
  const failing = harness({ start: async () => sseResponse([["error", { code: "AI_TIMEOUT", error: "استغرقت الإجابة وقتًا أطول من المعتاد", retryable: true }]]) });
  const failed = await runChatTurn({ transport: failing.transport, body: { requestId }, signal: failing.controller.signal, callbacks: failing.callbacks });
  assert.deepEqual(failed, { outcome: "failed", code: "AI_TIMEOUT", message: "استغرقت الإجابة وقتًا أطول من المعتاد", retryable: true });
  assert.equal(failing.log.statusCalls, 0);
  const refused = harness({ start: async () => Response.json({ error: "استخدمت الحد المتاح", code: "USAGE_LIMIT_REACHED" }, { status: 403 }) });
  const rejected = await runChatTurn({ transport: refused.transport, body: { requestId }, signal: refused.controller.signal, callbacks: refused.callbacks });
  assert.equal(rejected.outcome, "rejected");
  assert.equal(rejected.outcome === "rejected" && rejected.code, "USAGE_LIMIT_REACHED");
});

test("pressing Stop aborts quietly without asking the server about the answer", async () => {
  const controller = new AbortController();
  const stream = new Response(new ReadableStream({ start(c) { c.enqueue(encoder.encode(sse([["delta", { text: "…" }]]))); controller.signal.addEventListener("abort", () => c.error(new DOMException("aborted", "AbortError"))); } }), { headers: { "Content-Type": "text/event-stream" } });
  const { log, transport, callbacks } = harness({ start: async () => stream });
  const running = runChatTurn({ transport, body: { requestId }, signal: controller.signal, callbacks });
  await new Promise((r) => setTimeout(r, 10));
  controller.abort();
  assert.deepEqual(await running, { outcome: "aborted" });
  assert.equal(log.statusCalls, 0);
});

test("interruptions are typed so callers can tell them from real errors", async () => {
  await assert.rejects(consumeChatResponse(sseResponse([["delta", { text: "x" }]]), { onConversationId() {}, onChunk() {}, onComplete() {} }), (error: unknown) => error instanceof ChatStreamInterrupted && /حفظ الإجابة/.test(error.message));
});

test("request ids are v4 UUIDs the server accepts, and old clients without one still validate", () => {
  const first = newRequestId(), second = newRequestId();
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first, second);
  assert.ok(sendMessageSchema.safeParse({ content: "سؤال", requestId: first }).success);
  assert.ok(sendMessageSchema.safeParse({ content: "سؤال" }).success, "released app versions send no request id");
  assert.equal(sendMessageSchema.safeParse({ content: "سؤال", requestId: "not-a-uuid" }).success, false);
});

test("file preparation is reported with one vocabulary: uploading, processing, ready, failed", () => {
  assert.equal(fileSnapshot({ lectureStatus: "uploading" }).phase, "uploading");
  for (const status of ["uploaded", "processing"]) assert.equal(fileSnapshot({ lectureStatus: status }).phase, "processing");
  assert.equal(fileSnapshot({ lectureStatus: "uploaded", documentStatus: "embedding" }).message, "جارٍ تجهيز الملف للدراسة...");
  assert.equal(fileSnapshot({ lectureStatus: "ready", documentStatus: "ready" }).phase, "ready");
  assert.equal(fileSnapshot({ lectureStatus: "expired", documentStatus: "ready" }).phase, "ready", "an expired original keeps its extracted text");
  const failed = fileSnapshot({ lectureStatus: "failed", documentStatus: "failed", errorMessage: "boom" });
  assert.deepEqual([failed.phase, failed.code, failed.message, failed.retryable], ["failed", "FILE_PROCESSING_FAILED", "تعذر تجهيز الملف", true]);
  const empty = fileSnapshot({ lectureStatus: "failed", documentStatus: "needs_review", errorMessage: "No readable content" });
  assert.equal(empty.code, "NO_TEXT_EXTRACTED");
  assert.equal(classifyProcessingError("لم أجد نصًا مقروءًا للفهرسة"), "NO_TEXT_EXTRACTED");
  assert.equal(fileSnapshot({ lectureStatus: "ready", documentStatus: "embedding" }).phase, "processing", "a file is not ready until its index is");
  assert.equal(isNetworkFailure(new TypeError("Failed to fetch")), true);
  assert.equal(isNetworkFailure(new DOMException("x", "AbortError")), false);
});
