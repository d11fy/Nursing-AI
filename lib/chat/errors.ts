// Internal error kinds for the chat/file pipeline and the short Arabic messages students see.
// Safe to import from the web app, the Android app and the server (no server-only code).
export type ChatErrorCode =
  | "FILE_PROCESSING"
  | "FILE_PROCESSING_FAILED"
  | "NO_TEXT_EXTRACTED"
  | "CHAPTER_NOT_FOUND"
  | "STRUCTURE_UNCERTAIN"
  | "RAG_NO_MATCH"
  | "AI_TIMEOUT"
  | "STREAM_INTERRUPTED"
  | "NETWORK_OFFLINE"
  | "GENERATION_IN_PROGRESS"
  | "GENERATION_NOT_FOUND"
  | "INTERNAL";

export const CHAT_ERROR_MESSAGES: Record<ChatErrorCode, string> = {
  FILE_PROCESSING: "جارٍ تجهيز الملف للدراسة...",
  FILE_PROCESSING_FAILED: "تعذر تجهيز الملف",
  NO_TEXT_EXTRACTED: "تعذر تجهيز الملف: لم أجد نصًا مقروءًا فيه. جرّب نسخة أوضح أو ملف PDF نصيًا",
  CHAPTER_NOT_FOUND: "لم أجد هذا الفصل في الكتاب",
  STRUCTURE_UNCERTAIN: "لم أتأكد من فصول هذا الكتاب، اختر الفصل من القائمة",
  RAG_NO_MATCH: "لم أجد في الملف ما يجيب عن سؤالك، جرّب صياغة أخرى أو حدد الفصل أو الصفحة",
  AI_TIMEOUT: "استغرقت الإجابة وقتًا أطول من المعتاد، أعد المحاولة",
  STREAM_INTERRUPTED: "انقطع الاتصال، جارٍ التحقق من الإجابة...",
  NETWORK_OFFLINE: "لا يوجد اتصال بالإنترنت، سنتحقق من الإجابة عند عودته",
  GENERATION_IN_PROGRESS: "ما زال المعلم يجهز الإجابة...",
  GENERATION_NOT_FOUND: "لم يصل السؤال إلى الخادم، أعد الإرسال",
  INTERNAL: "صار خلل مؤقت أثناء تجهيز الإجابة. جرّب مرة ثانية بعد لحظات.",
};

export function chatErrorMessage(code: ChatErrorCode): string {
  return CHAT_ERROR_MESSAGES[code];
}

/** Maps the text the document pipeline stored in `error_message` to an internal kind. */
export function classifyProcessingError(message: string | null | undefined): "NO_TEXT_EXTRACTED" | "FILE_PROCESSING_FAILED" {
  return /No readable content|لم يتم العثور على نص|لم أجد نصًا|نص موثوق/i.test(message ?? "") ? "NO_TEXT_EXTRACTED" : "FILE_PROCESSING_FAILED";
}

/** Server-side classification of an exception raised while generating an answer. */
export function classifyGenerationError(error: unknown): ChatErrorCode {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  if (name === "TimeoutError" || /timeout|timed out|ETIMEDOUT/i.test(message)) return "AI_TIMEOUT";
  return "INTERNAL";
}

/** Client-side: was this fetch/stream failure caused by the network rather than the server? */
export function isNetworkFailure(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return false;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return error instanceof TypeError || /network|failed to fetch|load failed|connection|terminated|aborted|ECONNRESET|socket/i.test(message);
}
