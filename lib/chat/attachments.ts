import { chatErrorMessage, type ChatErrorCode } from "./errors";
import type { FilePhase } from "./file-status";

export interface ChatFileUpload {
  conversationId: string;
  lectureId: string;
  attachmentId?: string;
  status: string;
  phase?: FilePhase;
  code?: ChatErrorCode | null;
  message?: string | null;
  retryable?: boolean;
  error?: string | null;
  chapterCount?: number;
  structureConfidence?: string;
}

/** The file could not be prepared. `retryable` means the student may press "إعادة المحاولة". */
export class ChatFileError extends Error {
  constructor(message: string, readonly code: ChatErrorCode, readonly lectureId: string, readonly retryable: boolean) {
    super(message);
    this.name = "ChatFileError";
  }
}

export async function waitForChatFile(
  upload: ChatFileUpload,
  getStatus: (
    conversationId: string,
    lectureId: string,
  ) => Promise<Partial<ChatFileUpload>>,
  options: {
    signal?: AbortSignal;
    attempts?: number;
    delay?: (signal?: AbortSignal) => Promise<void>;
    onStatus?: (status: string, phase: FilePhase) => void;
  } = {},
): Promise<ChatFileUpload> {
  let current = upload;
  const delay =
    options.delay ??
    ((signal) =>
      new Promise<void>((resolve, reject) => {
        const cancelled = () => {
          clearTimeout(timer);
          reject(new DOMException("Cancelled", "AbortError"));
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener("abort", cancelled);
          resolve();
        }, 2000);
        signal?.addEventListener("abort", cancelled, { once: true });
        if (signal?.aborted) cancelled();
      }));
  for (let attempt = 0; attempt <= (options.attempts ?? 300); attempt++) {
    options.signal?.throwIfAborted();
    if (current.status === "ready" && current.attachmentId) return current;
    // "failed" is also what older servers report for a document that needs review or an expired original.
    if (current.phase === "failed" || ["failed", "needs_review", "expired", "deleted"].includes(current.status)) {
      const code: ChatErrorCode = current.code ?? "FILE_PROCESSING_FAILED";
      throw new ChatFileError(current.message || current.error || chatErrorMessage(code), code, upload.lectureId, current.retryable ?? true);
    }
    if (attempt === (options.attempts ?? 300)) break;
    options.onStatus?.(current.status, current.phase ?? (current.status === "uploading" ? "uploading" : "processing"));
    await delay(options.signal);
    current = {
      ...current,
      ...(await getStatus(upload.conversationId, upload.lectureId)),
    };
  }
  throw new ChatFileError(
    "الملف ما زال يُجهّز. افتحه من صفحة المادة بعد قليل؛ لا تحتاج لرفعه مرة أخرى.",
    "FILE_PROCESSING",
    upload.lectureId,
    false,
  );
}
