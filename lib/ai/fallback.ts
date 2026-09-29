import type { AIProvider, GenerateResult, GenerateTextParams, StreamChunk } from "@/lib/ai/provider";

export interface CircuitState {
  provider: string;
  consecutiveFailures: number;
  lastFailureAt: number;
  cooldownUntil: number;
  status: "healthy" | "degraded" | "rate_limited" | "offline";
}

const circuitStates: Record<string, CircuitState> = {
  openai: { provider: "openai", consecutiveFailures: 0, lastFailureAt: 0, cooldownUntil: 0, status: "healthy" },
  gemini: { provider: "gemini", consecutiveFailures: 0, lastFailureAt: 0, cooldownUntil: 0, status: "healthy" },
  groq: { provider: "groq", consecutiveFailures: 0, lastFailureAt: 0, cooldownUntil: 0, status: "healthy" },
  cloudflare: { provider: "cloudflare", consecutiveFailures: 0, lastFailureAt: 0, cooldownUntil: 0, status: "healthy" },
};

const FAILURE_THRESHOLD = 5;
const COOLDOWN_DURATION_MS = 90_000; // 90 seconds

export function resetCircuitBreaker(provider?: string) {
  if (provider) {
    circuitStates[provider] = {
      provider,
      consecutiveFailures: 0,
      lastFailureAt: 0,
      cooldownUntil: 0,
      status: "healthy",
    };
  } else {
    for (const p of Object.keys(circuitStates)) {
      circuitStates[p] = {
        provider: p,
        consecutiveFailures: 0,
        lastFailureAt: 0,
        cooldownUntil: 0,
        status: "healthy",
      };
    }
  }
}

export function getProviderCircuitState(provider: string): CircuitState {
  if (!circuitStates[provider]) {
    circuitStates[provider] = {
      provider,
      consecutiveFailures: 0,
      lastFailureAt: 0,
      cooldownUntil: 0,
      status: "healthy",
    };
  }
  const state = circuitStates[provider];
  // Check if cooldown expired
  if (state.cooldownUntil > 0 && Date.now() >= state.cooldownUntil) {
    state.status = "healthy";
    state.consecutiveFailures = 0;
    state.cooldownUntil = 0;
    console.log(`[CircuitBreaker] Provider "${provider}" cooldown expired, recovered to healthy.`);
  }
  return state;
}

export function recordProviderSuccess(provider: string) {
  const state = getProviderCircuitState(provider);
  if (state.status !== "healthy") {
    console.log(`[CircuitBreaker] Provider "${provider}" successfully recovered.`);
  }
  state.consecutiveFailures = 0;
  state.status = "healthy";
  state.cooldownUntil = 0;
}

export function recordProviderFailure(provider: string, isRateLimit = false) {
  const state = getProviderCircuitState(provider);
  state.consecutiveFailures += 1;
  state.lastFailureAt = Date.now();

  if (isRateLimit) {
    state.status = "rate_limited";
    state.cooldownUntil = Date.now() + 60_000; // 60s cooldown for 429
    console.warn(`[CircuitBreaker] Provider "${provider}" rate-limited. Cooldown until ${new Date(state.cooldownUntil).toISOString()}`);
  } else if (state.consecutiveFailures >= FAILURE_THRESHOLD) {
    state.status = "degraded";
    state.cooldownUntil = Date.now() + COOLDOWN_DURATION_MS;
    console.warn(`[CircuitBreaker] Provider "${provider}" exceeded failure threshold (${state.consecutiveFailures}). Marking degraded.`);
  }
}

/**
 * Checks if an error is eligible for fallback to another provider.
 * Fallback only on transient errors: 429, 408, 5xx, network timeout, quota.
 * DO NOT fallback on configuration errors: 400, 401, 403.
 */
export function isFallbackEligibleError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { status?: number; statusCode?: number; code?: string; message?: string };
  const status = anyErr.status || anyErr.statusCode;
  const msg = String(anyErr.message || "").toLowerCase();

  // Explicit configuration errors: DO NOT fallback silently
  if (status === 400 || status === 401 || status === 403) {
    return false;
  }
  if (msg.includes("api key") && (msg.includes("invalid") || msg.includes("incorrect"))) {
    return false;
  }

  // Transient / Fallback-eligible errors
  if (status === 429 || status === 408 || (status && status >= 500 && status <= 599)) {
    return true;
  }
  if (
    msg.includes("rate limit") ||
    msg.includes("quota") ||
    msg.includes("timeout") ||
    msg.includes("overloaded") ||
    msg.includes("service unavailable") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset")
  ) {
    return true;
  }

  return false;
}

export function isRateLimitError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { status?: number; message?: string };
  const msg = String(anyErr.message || "").toLowerCase();
  return anyErr.status === 429 || msg.includes("rate limit") || msg.includes("quota");
}

export interface FallbackExecutionResult<T> {
  result: T;
  providerUsed: string;
  fallbackUsed: boolean;
  fallbackFrom?: string;
  fallbackReason?: string;
}

/**
 * Executes an AI operation with automatic retry on transient error,
 * and fallback to secondary providers if primary fails.
 */
export async function executeWithFallback<T>(params: {
  primaryProvider: AIProvider;
  fallbackProviders: AIProvider[];
  operation: (provider: AIProvider) => Promise<T>;
  operationName?: string;
}): Promise<FallbackExecutionResult<T>> {
  const { primaryProvider, fallbackProviders, operation, operationName = "AI Request" } = params;

  // 1. Check primary circuit state
  const primaryState = getProviderCircuitState(primaryProvider.name);
  let providersToTry = [primaryProvider, ...fallbackProviders];

  // If primary is currently degraded or rate-limited, prioritize healthy fallbacks first
  if (primaryState.status === "degraded" || primaryState.status === "rate_limited") {
    console.warn(`[AI Router] Primary provider "${primaryProvider.name}" is ${primaryState.status}. Trying fallbacks first.`);
    providersToTry = [...fallbackProviders, primaryProvider];
  }

  let lastError: unknown = null;
  let fallbackFrom: string | undefined;
  let fallbackReason: string | undefined;

  for (let i = 0; i < providersToTry.length; i++) {
    const provider = providersToTry[i];
    const isPrimary = provider.name === primaryProvider.name;

    try {
      // 1 attempt with a single retry for transient error if primary
      let result: T;
      try {
        result = await operation(provider);
      } catch (firstErr) {
        if (isPrimary && isFallbackEligibleError(firstErr)) {
          console.warn(`[AI Router] Transient error on "${provider.name}". Retrying once...`);
          result = await operation(provider);
        } else {
          throw firstErr;
        }
      }

      recordProviderSuccess(provider.name);
      return {
        result,
        providerUsed: provider.name,
        fallbackUsed: !isPrimary,
        fallbackFrom,
        fallbackReason,
      };
    } catch (err) {
      lastError = err;
      const rateLimited = isRateLimitError(err);
      recordProviderFailure(provider.name, rateLimited);

      const eligible = isFallbackEligibleError(err);
      console.warn(`[AI Router] Provider "${provider.name}" failed during ${operationName}:`, err);

      if (!eligible) {
        // Non-transient configuration error -> throw immediately
        throw err;
      }

      fallbackFrom = provider.name;
      fallbackReason = rateLimited ? "PRIMARY_RATE_LIMIT" : "PRIMARY_TRANSIENT_ERROR";

      if (i < providersToTry.length - 1) {
        console.log(`[AI Router] AI_FALLBACK_STARTED: Switching from "${provider.name}" to "${providersToTry[i + 1].name}"`);
      }
    }
  }

  console.error(`[AI Router] AI_FALLBACK_FAILED: All providers failed for ${operationName}`);
  throw lastError || new Error("تعذر تجهيز الإجابة من جميع المزودات حاليًا. حاول مرة أخرى بعد قليل.");
}
