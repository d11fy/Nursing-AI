import type { ComplexityClass } from "@/lib/ai/provider";
import { CloudflareProvider } from "@/lib/ai/providers/cloudflare";
import { GeminiProvider } from "@/lib/ai/providers/gemini";
import { extractJson } from "@/lib/ai/json";

export interface QueryClassification {
  scope: "NURSING_IN_SCOPE" | "NURSING_OUT_OF_CURRICULUM" | "NON_NURSING" | "AMBIGUOUS";
  subject?: string;
  complexity: ComplexityClass;
  containsSensitiveData: boolean;
  reason?: string;
}

// 1. Fast local checks for Medical Sensitivity keywords (Elevates to COMPLEX automatically)
const MEDICAL_SENSITIVE_PATTERNS = [
  /جرعة|dosage|dose|mg\/kg|mcg\/kg/i,
  /موانع (استعمال|استخدام)|contraindication/i,
  /أعراض جانبية|adverse effect|toxicity|تسمم/i,
  /lab interpretation|فحص دم|تحليل دم|abg|arterial blood gas|غازات الدم/i,
  /clinical priority|أولوية تمريضية|priority nursing/i,
  /طوارئ|emergency nursing|triage|فرز الحالات/i,
  /patient scenario|حالة سريرية|مريض يعاني من/i,
  /تداخل دوائي|drug interaction/i,
  /عناية مركزة|critical care|icu/i,
  /resuscitation|cpr|إنعاش قلبي/i,
];

// 2. Fast local checks for obviously non-nursing requests (Football, entertainment, coding, politics)
const NON_NURSING_PATTERNS = [
  /مبارا[ةه]|برشلونة|ريال مدريد|كرة\s*قدم|كأس\s*العالم|دوري\s*أبطال/i,
  /أغنية|فيلم|مسلسل|ممثل|موسيقى|أغاني/i,
  /طبخ|وصف[ةه]|كيك[ةه]?|طريقة\s*عمل\s*(البيتزا|كيك|حلوى|أكل)/i,
  /عملات رقمية|بيتكوين|تداول أسهم|فوركس/i,
  /برمجة بايثون|جافاسكربت|كود برمجي|html css/i,
];

// 3. Fast PII scanner
const PII_PATTERNS = [
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/, // Email
  /\b(?:\+?\d{1,3}[\s-]?)?(?:\d{2,3}[\s-]?){3,4}\d\b/, // Phone
  /\b\d{9,12}\b/, // ID / Medical record number
];

export function isMedicalSensitive(text: string): boolean {
  return MEDICAL_SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

export function isObviouslyNonNursing(text: string): boolean {
  return NON_NURSING_PATTERNS.some((pattern) => pattern.test(text));
}

export function containsPii(text: string): boolean {
  return PII_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Fast Rule-Based Classifier.
 * Avoids unnecessary AI calls for obvious queries and UI-guided actions.
 */
export function classifyLocally(params: {
  question: string;
  hasImage?: boolean;
  feature?: string;
  subjectId?: string | null;
}): QueryClassification | null {
  const { question, hasImage, feature } = params;

  const hasPii = containsPii(question);

  // Clearly out of scope
  if (isObviouslyNonNursing(question)) {
    return {
      scope: "NON_NURSING",
      complexity: "SIMPLE",
      containsSensitiveData: hasPii,
      reason: "Matched out-of-scope non-nursing pattern",
    };
  }

  // Vision question
  if (hasImage) {
    return {
      scope: "NURSING_IN_SCOPE",
      complexity: "VISION",
      containsSensitiveData: hasPii,
      reason: "Attached image detected",
    };
  }

  // UI-guided features that determine complexity directly
  if (feature === "flashcards" || feature === "key_points") {
    return {
      scope: "NURSING_IN_SCOPE",
      complexity: "SIMPLE",
      containsSensitiveData: hasPii,
      reason: `UI feature is ${feature}`,
    };
  }

  // Medical-sensitive questions are immediately COMPLEX
  if (isMedicalSensitive(question)) {
    return {
      scope: "NURSING_IN_SCOPE",
      complexity: "COMPLEX",
      containsSensitiveData: hasPii,
      reason: "Matched medical-sensitive clinical pattern",
    };
  }

  // Short direct questions
  if (question.length < 50 && (/ما هو|ما هي|عرف|ما معنى|ما المقصود|define|what is/i.test(question))) {
    return {
      scope: "NURSING_IN_SCOPE",
      complexity: "SIMPLE",
      containsSensitiveData: hasPii,
      reason: "Short direct definition",
    };
  }

  return null;
}

const CLASSIFICATION_SYSTEM_PROMPT = `You are a curriculum scope and complexity classifier for Nursing AI.
Analyze the user question and return a valid JSON object:
{
  "scope": "NURSING_IN_SCOPE" | "NURSING_OUT_OF_CURRICULUM" | "NON_NURSING" | "AMBIGUOUS",
  "subject": "pharmacology" | "anatomy" | "fundamentals" | "pediatrics" | "maternity" | "medical_surgical" | "other",
  "complexity": "SIMPLE" | "NORMAL" | "COMPLEX",
  "contains_sensitive_data": false,
  "reason": "..."
}
RULES:
1. Clinical reasoning, drug doses, emergencies, or lab values are COMPLEX.
2. Short definitions or summaries are SIMPLE.
3. Standard nursing concepts are NORMAL.
4. If question is sports, entertainment, or irrelevant, scope is NON_NURSING.
Output ONLY JSON.`;

/**
 * Full Classifier Pipeline:
 * 1. Fast Local rule-based check.
 * 2. Cloudflare Workers AI utility call (if credentials available).
 * 3. Fallback to Gemini or heuristic if Cloudflare fails.
 */
export async function classifyRequest(params: {
  question: string;
  hasImage?: boolean;
  feature?: string;
  subjectId?: string | null;
  signal?: AbortSignal;
}): Promise<QueryClassification> {
  // Step 1: Local Rule-Based Check (0 cost, instant)
  const localResult = classifyLocally(params);
  if (localResult) return localResult;

  const hasPii = containsPii(params.question);
  const sensitiveByRule = isMedicalSensitive(params.question);

  // Step 2: Try Cloudflare Workers AI (fast & low cost utility)
  const cloudflare = new CloudflareProvider();
  if (await cloudflare.isAvailable()) {
    try {
      const res = await cloudflare.generateText({
        taskPrompt: CLASSIFICATION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: params.question }],
        maxOutputTokens: 200,
        signal: params.signal,
      });

      const parsed = JSON.parse(extractJson(res.content));
      const complexity: ComplexityClass = sensitiveByRule
        ? "COMPLEX"
        : (parsed.complexity as ComplexityClass) || "NORMAL";

      return {
        scope: parsed.scope || "NURSING_IN_SCOPE",
        subject: parsed.subject,
        complexity,
        containsSensitiveData: hasPii || parsed.contains_sensitive_data === true,
        reason: parsed.reason || "Classified via Cloudflare Workers AI",
      };
    } catch (err) {
      console.warn("[Classifier] Cloudflare classification failed, falling back to local/Gemini", err);
    }
  }

  // Step 3: Fallback heuristic if external utility is unavailable
  return {
    scope: "NURSING_IN_SCOPE",
    complexity: sensitiveByRule ? "COMPLEX" : "NORMAL",
    containsSensitiveData: hasPii,
    reason: "Fallback heuristic classification",
  };
}
