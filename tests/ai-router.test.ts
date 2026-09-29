import { test } from "node:test";
import assert from "node:assert/strict";
import { routeAIRequest } from "../lib/ai/router";
import { classifyLocally, isMedicalSensitive, isObviouslyNonNursing } from "../lib/ai/classifier";
import {
  executeWithFallback,
  isFallbackEligibleError,
  recordProviderFailure,
  recordProviderSuccess,
  getProviderCircuitState,
  resetCircuitBreaker,
} from "../lib/ai/fallback";
import { calculateAICost } from "../lib/ai/cost";
import { answerFromCurriculum, GROUNDED_RESPONSES } from "../lib/ai/grounded-answer";
import type { AIProvider, KnowledgeChunk } from "../lib/ai/provider";

test("routeAIRequest routes simple questions to Gemini economy provider", () => {
  const decision = routeAIRequest({
    complexity: "SIMPLE",
    feature: "chat",
  });
  assert.equal(decision.provider, "gemini");
  assert.ok(decision.fallbackProviders.includes("openai") || decision.fallbackProviders.includes("groq"));
});

test("routeAIRequest routes complex questions to OpenAI primary provider", () => {
  const decision = routeAIRequest({
    complexity: "COMPLEX",
    feature: "chat",
  });
  assert.equal(decision.provider, "openai");
  assert.ok(decision.fallbackProviders.includes("gemini"));
});

test("routeAIRequest routes vision requests to OpenAI Vision with Gemini fallback", () => {
  const decision = routeAIRequest({
    hasImage: true,
    complexity: "VISION",
    feature: "vision",
  });
  assert.equal(decision.provider, "openai");
  assert.equal(decision.fallbackProviders[0], "gemini");
});

test("routeAIRequest enforces privacy routing for sensitive data", () => {
  const decision = routeAIRequest({
    complexity: "SIMPLE",
    containsSensitiveData: true,
  });
  assert.equal(decision.provider, "openai");
  assert.equal(decision.reason, "PRIVACY_REQUIREMENT");
});

test("routeAIRequest triggers budget optimization when budgetRatio >= 0.8", () => {
  const decision = routeAIRequest({
    complexity: "NORMAL",
    budgetRatio: 0.85,
  });
  assert.equal(decision.provider, "gemini");
  assert.equal(decision.reason, "BUDGET_OPTIMIZATION");
});

test("medical sensitive classification elevates drug dosage and emergency to COMPLEX", () => {
  assert.equal(isMedicalSensitive("ما هي جرعة الديجوكسين الموصى بها؟"), true);
  assert.equal(isMedicalSensitive("contraindications of beta blockers"), true);
  assert.equal(isMedicalSensitive("تفسير غازات الدم الشرياني ABG"), true);
  assert.equal(isMedicalSensitive("ما هو تعريف التمريض؟"), false);
});

test("out-of-scope non-nursing questions are rejected by local rule classifier", () => {
  assert.equal(isObviouslyNonNursing("من فاز بمباراة برشلونة وريال مدريد؟"), true);
  assert.equal(isObviouslyNonNursing("طريقة عمل كيكة الشوكولاتة"), true);
  assert.equal(isObviouslyNonNursing("ما هي آلية عمل الباراسيتامول؟"), false);

  const local = classifyLocally({ question: "من فاز في مباراة اليوم؟" });
  assert.equal(local?.scope, "NON_NURSING");
});

test("isFallbackEligibleError correctly identifies transient errors vs config errors", () => {
  assert.equal(isFallbackEligibleError({ status: 429, message: "Rate limit exceeded" }), true);
  assert.equal(isFallbackEligibleError({ status: 503, message: "Service Unavailable" }), true);
  assert.equal(isFallbackEligibleError({ message: "Network fetch failed connection timeout" }), true);

  // Configuration errors must NOT fallback
  assert.equal(isFallbackEligibleError({ status: 401, message: "Incorrect API key" }), false);
  assert.equal(isFallbackEligibleError({ status: 400, message: "Bad Request" }), false);
  assert.equal(isFallbackEligibleError({ status: 403, message: "Forbidden" }), false);
});

test("executeWithFallback switches from failing primary provider to fallback provider", async () => {
  let primaryCalls = 0;
  let fallbackCalls = 0;

  const fakePrimary = {
    name: "openai",
    generateText: async () => {
      primaryCalls++;
      const err = new Error("Rate limit exceeded");
      (err as any).status = 429;
      throw err;
    },
    calculateCost: () => 0,
    healthCheck: async () => ({ provider: "openai", status: "rate_limited" as const, lastChecked: "" }),
  } as unknown as AIProvider;

  const fakeFallback = {
    name: "gemini",
    generateText: async () => {
      fallbackCalls++;
      return { content: "Answer from Gemini", inputTokens: 10, outputTokens: 20, model: "gemini-2.5-flash" };
    },
    calculateCost: () => 0,
    healthCheck: async () => ({ provider: "gemini", status: "healthy" as const, lastChecked: "" }),
  } as unknown as AIProvider;

  const result = await executeWithFallback({
    primaryProvider: fakePrimary,
    fallbackProviders: [fakeFallback],
    operation: (p) => p.generateText({ messages: [{ role: "user", content: "test" }] }),
  });

  assert.equal(result.providerUsed, "gemini");
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackFrom, "openai");
  assert.equal(result.result.content, "Answer from Gemini");
  assert.ok(primaryCalls >= 1);
  assert.equal(fallbackCalls, 1);
});

test("executeWithFallback propagates non-transient configuration errors without fallback", async () => {
  resetCircuitBreaker();
  const fakePrimary = {
    name: "openai",
    generateText: async () => {
      const err = new Error("Incorrect API key provided");
      (err as any).status = 401;
      throw err;
    },
    calculateCost: () => 0,
    healthCheck: async () => ({ provider: "openai", status: "offline" as const, lastChecked: "" }),
  } as unknown as AIProvider;

  const fakeFallback = {
    name: "gemini",
    generateText: async () => ({ content: "fallback", inputTokens: 1, outputTokens: 1, model: "m" }),
    calculateCost: () => 0,
    healthCheck: async () => ({ provider: "gemini", status: "healthy" as const, lastChecked: "" }),
  } as unknown as AIProvider;

  await assert.rejects(
    executeWithFallback({
      primaryProvider: fakePrimary,
      fallbackProviders: [fakeFallback],
      operation: (p) => p.generateText({ messages: [{ role: "user", content: "test" }] }),
    }),
    /Incorrect API key/
  );
});

test("calculateAICost calculates accurate costs for each provider", () => {
  const openaiCost = calculateAICost({
    provider: "openai",
    model: "gpt-5.4-mini",
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
  });
  assert.equal(openaiCost, 0.75); // 0.15 + 0.60

  const geminiCost = calculateAICost({
    provider: "gemini",
    model: "gemini-2.5-flash",
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
  });
  assert.equal(geminiCost, 0.375); // 0.075 + 0.30

  const freeCost = calculateAICost({
    provider: "gemini",
    model: "gemini-2.5-flash",
    inputTokens: 1000,
    outputTokens: 500,
    isFreeTier: true,
  });
  assert.equal(freeCost, 0);
});

test("curriculum policy invariant: NO SOURCE = NO ACADEMIC ANSWER", async () => {
  let modelCalled = false;
  const fakeProvider = {
    name: "gemini",
    generateText: async () => {
      modelCalled = true;
      return {
        content: JSON.stringify({ intent: "academic", standaloneQuestion: "What is septic shock?", searchQueries: ["septic shock"] }),
        model: "gemini-2.5-flash",
        inputTokens: 5,
        outputTokens: 5,
      };
    },
    calculateCost: () => 0,
    healthCheck: async () => ({ provider: "gemini", status: "healthy" as const, lastChecked: "" }),
  } as unknown as AIProvider;

  const result = await answerFromCurriculum(
    { question: "ما هو الصدمة الإنتانية؟", history: [], personalization: "" },
    {
      provider: fakeProvider,
      retrieve: async () => [], // No sources returned
    }
  );

  assert.equal(result.reason, "NO_SOURCE");
  assert.equal(result.content, GROUNDED_RESPONSES.missing);
});
