import type { AIProvider } from './provider';
// Compatibility during rollout. SDK retries only the SAME OpenAI request.
export async function executeWithFallback<T>(params: { primaryProvider: AIProvider; fallbackProviders: AIProvider[]; operation: (provider: AIProvider) => Promise<T>; operationName?: string }) {
  if (params.primaryProvider.name !== 'openai' || params.fallbackProviders.length) throw new Error('Multiple providers are disabled');
  return { result: await params.operation(params.primaryProvider), providerUsed: 'openai', fallbackUsed: false,
    fallbackFrom: undefined as string | undefined, fallbackReason: undefined as string | undefined };
}
export function getProviderCircuitState(provider: string) {
  return { provider, status: provider === 'openai' ? 'healthy' : 'disabled', consecutiveFailures: 0, cooldownUntil: null, lastError: null, lastErrorAt: null };
}
