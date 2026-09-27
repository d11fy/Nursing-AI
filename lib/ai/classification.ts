import "server-only";
import { getAIProvider } from "@/lib/ai";
import { extractJson } from "@/lib/ai/json";
import type { Classification } from "@/types/database";

export interface ClassificationResult {
  classification: Classification;
  confidence: number;
  privacyFlagged: boolean;
}

// Fast, deterministic pre-scan: any hit skips the AI call entirely and
// forces a privacy review — cheaper and more reliable than asking a model
// to notice an email address.
const PII_PATTERNS = [
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/, // email
  /\b(?:\+?\d{1,3}[\s-]?)?(?:\d{2,3}[\s-]?){3,4}\d\b/, // phone-like digit runs
  /\b\d{9,12}\b/, // national ID / medical record number-like sequences
];

function scanForPii(text: string): boolean {
  return PII_PATTERNS.some((pattern) => pattern.test(text));
}

const CLASSIFICATION_PROMPT = `You are a strict content classifier for a nursing-education knowledge base.
Given an excerpt from a student-uploaded lecture, decide:
1. classification: "NURSING_RELATED" if it covers nursing, anatomy, physiology, pharmacology, pathophysiology,
   medical-surgical nursing, pediatrics, maternity, mental health, community health, or clinical skills.
   "NOT_NURSING" if clearly unrelated to any of those topics. "UNCERTAIN" if you cannot tell confidently.
2. confidence: a number from 0 to 1.
3. contains_personal_data: true if the text contains a real patient name, phone number, email, national ID,
   medical record number, address, or any other identifying information about a real person.
Respond with ONLY a JSON object, no prose and no markdown fences:
{"classification": "NURSING_RELATED", "confidence": 0.0, "contains_personal_data": false, "reason": "..."}`;

function normalizeClassification(value: unknown): Classification | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase().replace(/\s+/g, "_");
  return key === "nursing_related" || key === "not_nursing" || key === "uncertain" ? key : null;
}

/**
 * Classifies a lecture text sample for the contribution review queue.
 * Never throws — any failure (offline provider, malformed JSON, unexpected
 * shape) resolves to "uncertain" so the admin decides, matching the spec's
 * "prefer not to make approval 100% automatic" rule.
 */
export async function classifyLectureContent(sample: string): Promise<ClassificationResult> {
  if (scanForPii(sample)) {
    return { classification: "uncertain", confidence: 0, privacyFlagged: true };
  }
  try {
    const provider = getAIProvider();
    // Providers always prepend their own nursing-tutor system prompt, so the
    // classification instructions go in the user message instead of a second
    // (and likely conflicting) system message.
    const result = await provider.generateText({
      messages: [
        { role: "user", content: `${CLASSIFICATION_PROMPT}\n\n---\nExcerpt:\n${sample.slice(0, 6000)}` },
      ],
    });
    const parsed = JSON.parse(extractJson(result.content)) as Record<string, unknown>;
    const classification = normalizeClassification(parsed.classification);
    if (!classification) return { classification: "uncertain", confidence: 0, privacyFlagged: false };
    const confidence = typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0;
    return { classification, confidence, privacyFlagged: parsed.contains_personal_data === true };
  } catch (error) {
    console.error("classifyLectureContent error", error);
    return { classification: "uncertain", confidence: 0, privacyFlagged: false };
  }
}
