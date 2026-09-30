import type { ComplexityClass } from "@/lib/ai/provider";

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

// Retained for rollback callers only. The new tutor resolves scope in its final
// Responses request using the student's assigned curriculum; no utility API call.
export async function classifyRequest(params: {question:string;hasImage?:boolean;feature?:string;subjectId?:string|null;signal?:AbortSignal}):Promise<QueryClassification>{
 return classifyLocally(params)??{scope:'NURSING_IN_SCOPE',complexity:isMedicalSensitive(params.question)?'COMPLEX':'NORMAL',containsSensitiveData:containsPii(params.question)};
}
