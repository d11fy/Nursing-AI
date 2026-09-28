import { test } from "node:test";
import assert from "node:assert/strict";
import { OllamaProvider } from "../lib/ai/providers/ollama";
import { getAIConfig } from "../lib/ai/config.mjs";
import { chunkText } from "../lib/ai/rag";

process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
process.env.OLLAMA_CHAT_MODEL = "qwen2.5:3b";
process.env.OLLAMA_VISION_MODEL = "qwen3-vl:2b-instruct";
process.env.OLLAMA_EMBEDDING_MODEL = "nomic-embed-text";

test("Ollama configuration works without OpenAI, validates URL and model", () => {
  assert.equal(getAIConfig({ AI_PROVIDER: "ollama" }).embeddingModel, "nomic-embed-text");
  assert.equal(getAIConfig({ AI_PROVIDER: "ollama" }).visionModel, "qwen3-vl:2b-instruct");
  assert.throws(() => getAIConfig({ AI_PROVIDER: "unknown" }), /AI_PROVIDER/);
  assert.throws(() => getAIConfig({ AI_PROVIDER: "openai" }), /OPENAI_API_KEY/);
  assert.throws(() => getAIConfig({ AI_PROVIDER: "ollama", OLLAMA_BASE_URL: "localhost:11434" }), /OLLAMA_BASE_URL/);
  assert.throws(() => getAIConfig({ AI_PROVIDER: "ollama", OLLAMA_CHAT_MODEL: " " }), /OLLAMA_CHAT_MODEL/);
  assert.throws(() => getAIConfig({ AI_PROVIDER: "ollama", OLLAMA_VISION_MODEL: " " }), /OLLAMA_VISION_MODEL/);
});

test("chat sends context, think false, and reports usage", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.ok(url.endsWith("/api/chat"));
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, "qwen2.5:3b");
    assert.equal(body.stream, false);
    assert.equal(body.think, false);
    assert.deepEqual(body.options, { temperature: 0.2 });
    assert.ok(body.messages[0].content.includes("Knowledge test"));
    assert.deepEqual(body.messages[1], { role: "user", content: "hello" });
    return Response.json({ message: { content: "reply" }, done: true, prompt_eval_count: 10, eval_count: 4 });
  });
  const provider = new OllamaProvider();
  assert.deepEqual(await provider.generateText({ messages: [{ role: "user", content: "hello" }], knowledge: [{ content: "Knowledge test", similarity: 1 }] }), { content: "reply", inputTokens: 10, outputTokens: 4, model: "qwen2.5:3b" });
  assert.equal(provider.calculateCost({ model: "anything", inputTokens: 100, outputTokens: 100 }), 0);
});

test("NDJSON handles split UTF8, empty lines and final line without newline", async (t) => {
  const bytes = new TextEncoder().encode('\n{"message":{"content":"مرحبا"},"done":false}\r\n{"message":{"content":"!"},"done":true,"prompt_eval_count":7,"eval_count":2}');
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    assert.equal(JSON.parse(String(init.body)).stream, true);
    return new Response(new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(new Uint8Array([byte])); c.close(); } }));
  });
  const stream = new OllamaProvider().generateStream({ messages: [] });
  assert.deepEqual((await stream.next()).value, { delta: "مرحبا" });
  assert.deepEqual((await stream.next()).value, { delta: "!" });
  assert.deepEqual(await stream.next(), { done: true, value: { content: "مرحبا!", model: "qwen2.5:3b", inputTokens: 7, outputTokens: 2 } });
});

test("truncated, malformed and error streams fail instead of completing silently", async (t) => {
  for (const body of ['{"message":{"content":"partial"}}\n', '{invalid}\n', '{"error":"missing model"}\n']) {
    const mock = t.mock.method(globalThis, "fetch", async () => new Response(body));
    await assert.rejects(async () => { for await (const chunk of new OllamaProvider().generateStream({ messages: [] })) void chunk; }, /Ollama/);
    mock.mock.restore();
  }
});

test("stream cancellation releases the HTTP body", async (t) => {
  let cancelled = false;
  t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"message":{"content":"x"}}\n')); }, cancel() { cancelled = true; } })));
  for await (const chunk of new OllamaProvider().generateStream({ messages: [] })) { assert.equal(chunk.delta, "x"); break; }
  assert.equal(cancelled, true);
});

test("embeddings use batch input and actual dimensions", async (t) => {
  const vectors = [Array(768).fill(0.5), Array(768).fill(0.2)];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.ok(url.endsWith("/api/embed"));
    assert.deepEqual(JSON.parse(String(init.body)), { model: "nomic-embed-text", input: ["one", "two"], truncate: false });
    return Response.json({ embeddings: vectors, prompt_eval_count: 8 });
  });
  const result = await new OllamaProvider().createEmbeddings(["one", "two"]);
  assert.deepEqual(result.map((v) => v.embedding), vectors);
  assert.equal(result[0].model, "nomic-embed-text");
  assert.deepEqual(await new OllamaProvider().createEmbeddings([]), []);
});

test("invalid embedding lengths/counts are rejected", async (t) => {
  for (const embeddings of [[], [[1], [1, 2]], [["x"], [0]], [[], []]]) {
    const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ embeddings }));
    await assert.rejects(new OllamaProvider().createEmbeddings(["a", "b"]), /invalid embeddings/);
    mock.mock.restore();
  }
});

test("vision sends base64 images to the configured local model", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.ok(url.endsWith("/api/chat"));
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, "qwen3-vl:2b-instruct");
    assert.equal(body.stream, false);
    assert.equal(body.think, false);
    assert.equal(body.options.num_ctx, 2048);
    assert.equal(body.options.num_predict, 350);
    assert.deepEqual(body.messages[1], { role: "user", content: "اشرح الصورة", images: ["aGVsbG8="] });
    return Response.json({ message: { content: "تحليل الصورة" }, done: true, prompt_eval_count: 12, eval_count: 3 });
  });
  const result = await new OllamaProvider().generateVisionResponse({
    messages: [{ role: "user", content: "اشرح الصورة" }],
    imageUrl: "data:image/png;base64,aGVsbG8=",
    maxOutputTokens: 350,
  });
  assert.deepEqual(result, { content: "تحليل الصورة", inputTokens: 12, outputTokens: 3, model: "qwen3-vl:2b-instruct" });
});

test("vision can stream partial output immediately", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    assert.equal(JSON.parse(String(init.body)).stream, true);
    return new Response('{"message":{"content":"تحليل "},"done":false}\n{"message":{"content":"سريع"},"done":true,"prompt_eval_count":8,"eval_count":2}\n');
  });
  const stream = new OllamaProvider().generateVisionStream({ messages: [], imageUrl: "data:image/webp;base64,aGVsbG8=" });
  assert.deepEqual((await stream.next()).value, { delta: "تحليل " });
  assert.deepEqual((await stream.next()).value, { delta: "سريع" });
  assert.deepEqual(await stream.next(), { done: true, value: { content: "تحليل سريع", model: "qwen3-vl:2b-instruct", inputTokens: 8, outputTokens: 2 } });
});

test("offline errors are actionable and invalid vision data is rejected locally", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new TypeError("fetch failed"); });
  const provider = new OllamaProvider();
  await assert.rejects(provider.generateVisionResponse({ messages: [], imageUrl: "https://example.test/a.png" }), /Unsupported image data/);
  assert.equal(mock.mock.callCount(), 0);
  await assert.rejects(provider.createEmbedding("hello"), /ollama serve/);
  await assert.rejects(provider.generateText({ messages: [{ role: "user", content: "a", imageUrl: "test" }] }), /generateVisionResponse/);
});

test("HTTP model errors suggest pulling models; caller abort is preserved", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => new Response("not found", { status: 404 }));
  await assert.rejects(new OllamaProvider().createEmbedding("hello"), /ollama pull/);
  mock.mock.restore();
  const controller = new AbortController();
  controller.abort(new Error("User stopped"));
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => { init.signal?.throwIfAborted(); return Response.json({}); });
  await assert.rejects(new OllamaProvider().generateText({ messages: [], signal: controller.signal }), /User stopped/);
});

test("long unbroken paragraphs remain within embedding chunk bounds", () => {
  const text = "word".repeat(1000);
  const chunks = chunkText(text);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 1200));
  assert.ok(chunks.at(-1)?.endsWith("word"));
});
