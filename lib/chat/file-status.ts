// One vocabulary for file preparation: uploading -> processing -> ready | failed.
// The database keeps finer states (extracting, chunking, embedding, needs_review ...); students see these four.
import { chatErrorMessage, classifyProcessingError, type ChatErrorCode } from "./errors";

export type FilePhase = "uploading" | "processing" | "ready" | "failed";
export type FileSnapshot = {
  phase: FilePhase;
  code: ChatErrorCode | null;
  message: string | null;
  retryable: boolean;
};

export function fileSnapshot(input: { lectureStatus: string | null; documentStatus?: string | null; errorMessage?: string | null }): FileSnapshot {
  const lecture = input.lectureStatus ?? "uploaded";
  const document = input.documentStatus ?? null;
  if (lecture === "uploading") return { phase: "uploading", code: null, message: null, retryable: false };
  // An expired original keeps its extracted text, so the file is still usable for study.
  if ((lecture === "ready" || lecture === "expired") && (document === null || document === "ready"))
    return { phase: "ready", code: null, message: null, retryable: false };
  if (lecture === "failed" || lecture === "deleted" || document === "failed" || document === "needs_review") {
    const code = document === "needs_review" ? "NO_TEXT_EXTRACTED" : classifyProcessingError(input.errorMessage);
    return { phase: "failed", code, message: chatErrorMessage(code), retryable: lecture !== "deleted" };
  }
  return { phase: "processing", code: "FILE_PROCESSING", message: chatErrorMessage("FILE_PROCESSING"), retryable: false };
}
