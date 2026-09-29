import type {
  AIProvider,
  EmbeddingResult,
  GenerateResult,
  GenerateTextParams,
  ProviderHealth,
  StreamChunk,
} from "@/lib/ai/provider";
import { OpenAIProvider } from "@/lib/ai/providers/openai";
import { calculateAICost } from "@/lib/ai/cost";

export function getCloudflareClassifierModel(): string {
  return process.env.CLOUDFLARE_CLASSIFIER_MODEL?.trim() || "@cf/meta/llama-3.1-8b-instruct";
}

export class CloudflareProvider implements AIProvider {
  readonly name: string = "cloudflare";
  private accountId: string;
  private apiToken: string;

  constructor(accountId?: string, apiToken?: string) {
    this.accountId = accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
    this.apiToken = apiToken ?? process.env.CLOUDFLARE_API_TOKEN?.trim() ?? "";
  }

  async isAvailable(): Promise<boolean> {
    const acc = this.accountId || process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const token = this.apiToken || process.env.CLOUDFLARE_API_TOKEN?.trim();
    return Boolean(acc && token && token !== "placeholder");
  }

  async healthCheck(): Promise<ProviderHealth> {
    const acc = this.accountId || process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const token = this.apiToken || process.env.CLOUDFLARE_API_TOKEN?.trim();
    if (!acc || !token || token === "placeholder") {
      return {
        provider: "cloudflare",
        status: "disabled",
        lastChecked: new Date().toISOString(),
        lastError: "CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN is not configured",
      };
    }

    const start = Date.now();
    try {
      const model = getCloudflareClassifierModel();
      const url = `https://api.cloudflare.com/client/v4/accounts/${acc}/ai/run/${model}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(8_000),
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          provider: "cloudflare",
          status: res.status === 429 ? "rate_limited" : "offline",
          latencyMs: Date.now() - start,
          lastError: `HTTP ${res.status}: ${text.slice(0, 100)}`,
          lastChecked: new Date().toISOString(),
        };
      }

      const json = await res.json();
      return {
        provider: "cloudflare",
        status: "healthy",
        latencyMs: Date.now() - start,
        model,
        lastChecked: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        provider: "cloudflare",
        status: "offline",
        latencyMs: Date.now() - start,
        lastError: msg,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  async generateText(params: GenerateTextParams): Promise<GenerateResult> {
    const acc = this.accountId || process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const token = this.apiToken || process.env.CLOUDFLARE_API_TOKEN?.trim();
    if (!acc || !token) {
      throw new Error("Cloudflare Workers AI credentials missing.");
    }

    const model = getCloudflareClassifierModel();
    const url = `https://api.cloudflare.com/client/v4/accounts/${acc}/ai/run/${model}`;

    const messages = [];
    if (params.taskPrompt) {
      messages.push({ role: "system", content: params.taskPrompt });
    }
    for (const m of params.messages) {
      messages.push({ role: m.role, content: m.content });
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages,
        max_tokens: params.maxOutputTokens ?? 512,
      }),
      signal: params.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Cloudflare Workers AI error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const content = data?.result?.response || data?.result?.description || "";
    // Cloudflare Workers AI token estimate
    const inputEstimate = messages.reduce((acc, m) => acc + (m.content?.length || 0), 0) / 4;
    const outputEstimate = (content?.length || 0) / 4;

    return {
      content,
      inputTokens: Math.ceil(inputEstimate),
      outputTokens: Math.ceil(outputEstimate),
      model,
    };
  }

  async *generateStream(
    params: GenerateTextParams
  ): AsyncGenerator<StreamChunk, GenerateResult, unknown> {
    const res = await this.generateText(params);
    yield { delta: res.content };
    return res;
  }

  async generateVisionResponse(
    params: GenerateTextParams & { imageUrl: string }
  ): Promise<GenerateResult> {
    const openai = new OpenAIProvider();
    return openai.generateVisionResponse(params);
  }

  async createEmbedding(text: string): Promise<EmbeddingResult> {
    const [res] = await this.createEmbeddings([text]);
    return res;
  }

  async createEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    const openai = new OpenAIProvider();
    return openai.createEmbeddings(texts);
  }

  calculateCost(params: { model: string; inputTokens: number; outputTokens: number }): number {
    return calculateAICost({
      provider: "cloudflare",
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
    });
  }
}
