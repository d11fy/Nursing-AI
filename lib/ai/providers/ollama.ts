import type { AIProvider, EmbeddingResult, GenerateResult, GenerateTextParams, StreamChunk } from "../provider";
import { OLLAMA_NURSING_SYSTEM_PROMPT, buildKnowledgeContext } from "../system-prompt";
import { getAIConfig } from "../config.mjs";

const OLLAMA_VISION_SYSTEM_PROMPT = `أنت مساعد تعليمي لطلاب التمريض. حلّل الصورة المرفقة بدقة واكتب بالعربية الواضحة.
- ابدأ بوصف مختصر لما يظهر فعلًا في الصورة.
- أجب في 4 إلى 6 نقاط قصيرة وبحد أقصى 140 كلمة، واشرح وظيفة الأجزاء الظاهرة وعلاقتها بالسؤال فقط.
- اذكر أسماء الأجزاء التي تراها بوضوح فقط. لا تحوّل كلمة غير مقروءة إلى مصطلح طبي، وقل إن التسمية غير واضحة عند الحاجة.
- لا تسرد كل التسميات دون شرح، وراجع صحة الاتجاهات والوظائف قبل إنهاء الإجابة.
- لا تكرر الكلمة أو الجملة أو قائمة التسميات. إذا اكتمل الشرح فتوقف فورًا.
- لا تضع تشخيصًا أو معلومة طبية لا تدعمها الصورة.`;

export class OllamaError extends Error {}
type ChatResponse = { message?: { content?: string }; done?: boolean; prompt_eval_count?: number; eval_count?: number; error?: string };

export class OllamaProvider implements AIProvider {
  private readonly baseUrl: string;
  private readonly chatModel: string;
  private readonly visionModel: string;
  private readonly embeddingModel: string;

  constructor() {
    const config = getAIConfig({ ...process.env, AI_PROVIDER: "ollama" });
    this.baseUrl = config.baseUrl!;
    this.chatModel = config.chatModel!;
    this.visionModel = config.visionModel!;
    this.embeddingModel = config.embeddingModel;
  }

  private async post(path: string, body: object, signal?: AbortSignal): Promise<Response> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        signal: AbortSignal.any([AbortSignal.timeout(300_000), ...(signal ? [signal] : [])]),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new OllamaError(`Ollama HTTP ${response.status}: تعذّر تنفيذ الطلب. تأكد من تنزيل الموديل باستخدام ollama pull ومراجعة سجل Ollama.`);
      }
      return response;
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (error instanceof OllamaError) throw error;
      throw new OllamaError("تعذّر الاتصال بـ Ollama أو انتهت المهلة. شغّل ollama serve وتحقق من OLLAMA_BASE_URL وإمكانية وصول التطبيق إليه.");
    }
  }

  private body(params: GenerateTextParams, stream: boolean) {
    if (params.messages.some((message) => message.imageUrl)) {
      throw new OllamaError("استخدم مسار تحليل الصور مع هذا الطلب / Vision input requires generateVisionResponse");
    }
    return {
      model: this.chatModel, stream, think: false, keep_alive: "10m",
      options: { temperature: 0.2 },
      messages: [
        { role: "system", content: OLLAMA_NURSING_SYSTEM_PROMPT + (params.knowledge?.length ? buildKnowledgeContext(params.knowledge) : "") },
        ...params.messages.map(({ role, content }) => ({ role, content })),
      ],
    };
  }

  private imageBase64(imageUrl: string): string {
    const match = /^data:image\/(?:jpeg|jpg|png|webp);base64,([a-z0-9+/=]+)$/i.exec(imageUrl);
    if (!match?.[1]) throw new OllamaError("صيغة الصورة غير مدعومة؛ استخدم JPEG أو PNG أو WebP / Unsupported image data");
    return match[1];
  }

  private visionBody(params: GenerateTextParams & { imageUrl: string }, stream = false) {
    const image = this.imageBase64(params.imageUrl);
    const lastUserIndex = params.messages.findLastIndex((message) => message.role === "user");
    const messages = params.messages.map(({ role, content }, index) =>
      index === lastUserIndex ? { role, content, images: [image] } : { role, content }
    );
    if (lastUserIndex < 0) messages.push({ role: "user", content: "حلّل الصورة المرفقة.", images: [image] });
    return {
      model: this.visionModel,
      stream,
      think: false,
      keep_alive: "10m",
      options: {
        temperature: 0.1,
        top_k: 20,
        top_p: 0.8,
        repeat_penalty: 1.18,
        repeat_last_n: 256,
        num_ctx: 2048,
        num_predict: params.maxOutputTokens ?? 400,
      },
      messages: [
        { role: "system", content: OLLAMA_VISION_SYSTEM_PROMPT + (params.knowledge?.length ? buildKnowledgeContext(params.knowledge) : "") },
        ...messages,
      ],
    };
  }

  private parse(line: string): ChatResponse {
    let value: ChatResponse;
    try { value = JSON.parse(line); } catch { throw new OllamaError("Ollama returned invalid JSON / استجابة محلية غير صالحة"); }
    if (!value || typeof value !== "object" || value.error || (value.message?.content !== undefined && typeof value.message.content !== "string")) {
      throw new OllamaError("Ollama returned an error / فشل الموديل المحلي؛ راجع سجل Ollama والموديل المثبّت.");
    }
    return value;
  }

  private async readText(response: Response, signal?: AbortSignal): Promise<string> {
    try { return await response.text(); }
    catch {
      if (signal?.aborted) throw signal.reason;
      throw new OllamaError("انقطع الاتصال بـ Ollama أثناء قراءة الرد أو انتهت المهلة.");
    }
  }

  private result(content: string, value: ChatResponse, model = this.chatModel): GenerateResult {
    return { content, model, inputTokens: value.prompt_eval_count ?? 0, outputTokens: value.eval_count ?? 0 };
  }

  async generateText(params: GenerateTextParams): Promise<GenerateResult> {
    const response = await this.post("/api/chat", this.body(params, false), params.signal);
    const value = this.parse(await this.readText(response, params.signal));
    if (!value.done || !value.message) throw new OllamaError("Ollama returned an incomplete response");
    return this.result(value.message.content ?? "", value);
  }

  async *generateStream(params: GenerateTextParams): AsyncGenerator<StreamChunk, GenerateResult, unknown> {
    const response = await this.post("/api/chat", this.body(params, true), params.signal);
    if (!response.body) throw new OllamaError("Ollama returned an empty stream");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let content = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        if (done && pending.trim()) { lines.push(pending); pending = ""; }
        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = this.parse(line);
          const delta = chunk.message?.content ?? "";
          if (delta) { content += delta; yield { delta }; }
          if (chunk.done) return this.result(content, chunk);
        }
        if (done) throw new OllamaError("انقطع رد Ollama قبل اكتماله / Incomplete Ollama stream");
      }
    } catch (error) {
      if (params.signal?.aborted) throw params.signal.reason;
      if (error instanceof OllamaError) throw error;
      throw new OllamaError("انقطع الاتصال بـ Ollama أو انتهت المهلة؛ تحقق من الخدمة ثم حاول مجددًا.");
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  async generateVisionResponse(params: GenerateTextParams & { imageUrl: string }): Promise<GenerateResult> {
    const response = await this.post("/api/chat", this.visionBody(params), params.signal);
    const value = this.parse(await this.readText(response, params.signal));
    if (!value.done || !value.message) throw new OllamaError("Ollama vision returned an incomplete response");
    return this.result(value.message.content ?? "", value, this.visionModel);
  }

  async *generateVisionStream(params: GenerateTextParams & { imageUrl: string }): AsyncGenerator<StreamChunk, GenerateResult, unknown> {
    const response = await this.post("/api/chat", this.visionBody(params, true), params.signal);
    if (!response.body) throw new OllamaError("Ollama returned an empty vision stream");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let content = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        if (done && pending.trim()) { lines.push(pending); pending = ""; }
        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = this.parse(line);
          const delta = chunk.message?.content ?? "";
          if (delta) { content += delta; yield { delta }; }
          if (chunk.done) return this.result(content, chunk, this.visionModel);
        }
        if (done) throw new OllamaError("انقطع رد تحليل الصورة قبل اكتماله / Incomplete Ollama vision stream");
      }
    } catch (error) {
      if (params.signal?.aborted) throw params.signal.reason;
      if (error instanceof OllamaError) throw error;
      throw new OllamaError("انقطع الاتصال أثناء تحليل الصورة أو انتهت المهلة؛ حاول مجددًا.");
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  async createEmbedding(text: string): Promise<EmbeddingResult> {
    return (await this.createEmbeddings([text]))[0];
  }

  async createEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    if (!texts.length) return [];
    const response = await this.post("/api/embed", { model: this.embeddingModel, input: texts, truncate: false });
    let data;
    try { data = JSON.parse(await this.readText(response)); }
    catch (error) {
      if (error instanceof OllamaError) throw error;
      throw new OllamaError("Ollama returned invalid embedding JSON");
    }
    const vectors: unknown = data?.embeddings;
    if (!Array.isArray(vectors) || vectors.length !== texts.length || vectors.some((v) => !Array.isArray(v) || !v.length || v.length !== vectors[0].length || v.some((n: unknown) => typeof n !== "number" || !Number.isFinite(n)))) {
      throw new OllamaError("Ollama returned invalid embeddings / أبعاد أو عدد المتجهات غير صالح");
    }
    return vectors.map((embedding) => ({ embedding, tokens: Math.ceil((data.prompt_eval_count ?? 0) / texts.length), model: this.embeddingModel }));
  }

  calculateCost(_params: { model: string; inputTokens: number; outputTokens: number }): number { void _params; return 0; }
}
