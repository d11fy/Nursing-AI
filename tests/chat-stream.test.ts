import { test } from "node:test";
import assert from "node:assert/strict";
import { consumeChatResponse } from "../lib/chat/stream";

test("new conversation stays visible until streaming and persistence finish", async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const response = new Response(new ReadableStream({ start(c) { controller = c; } }), {
    headers: { "X-Conversation-Id": "new-conversation" },
  });
  let conversationId: string | null = null;
  let visibleAnswer = "";
  const navigations: (string | null)[] = [];
  const received: (() => void)[] = [];
  const running = consumeChatResponse(response, {
    onConversationId: (id) => { conversationId = id; },
    onChunk: (text) => { visibleAnswer += text; received.shift()?.(); },
    onComplete: (id) => { navigations.push(id); },
  });
  assert.equal(conversationId, "new-conversation");
  const firstChunk = new Promise<void>((resolve) => received.push(resolve));
  controller.enqueue(new TextEncoder().encode("شرح السؤال"));
  await firstChunk;
  assert.equal(visibleAnswer, "شرح السؤال");
  assert.deepEqual(navigations, []);
  // Response is still open while the server saves the answer.
  controller.close();
  await running;
  assert.equal(visibleAnswer, "شرح السؤال");
  assert.deepEqual(navigations, ["new-conversation"]);
});

test("failed or cancelled streaming does not navigate away from the partial answer", async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const response = new Response(new ReadableStream({ start(c) { controller = c; } }));
  let complete = false;
  const running = consumeChatResponse(response, {
    onConversationId() {}, onChunk() {}, onComplete() { complete = true; },
  });
  const rejected = assert.rejects(running, /cancelled/);
  controller.error(new Error("cancelled"));
  await rejected;
  assert.equal(complete, false);
});

test("Arabic UTF-8 characters survive chunk boundaries", async () => {
  const encoded = new TextEncoder().encode("إجابة تمريضية");
  const response = new Response(new ReadableStream({ start(c) {
    for (const byte of encoded) c.enqueue(new Uint8Array([byte]));
    c.close();
  } }));
  let text = "";
  await consumeChatResponse(response, { onConversationId() {}, onChunk(chunk) { text += chunk; }, onComplete() {} });
  assert.equal(text, "إجابة تمريضية");
});
