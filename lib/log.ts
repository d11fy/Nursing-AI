import "server-only";

export type LogEvent =
  | 'QUERY_RECEIVED' | 'CONTEXT_RESOLVED' | 'RETRIEVAL_COMPLETED' | 'GENERAL_FALLBACK_USED' | 'ANSWER_GENERATED' | 'MEMORY_UPDATED' | 'MEMORY_UPDATE_FAILED'
  | "FILE_UPLOAD_STARTED"
  | "FILE_UPLOAD_COMPLETED"
  | "FILE_UPLOAD_FAILED"
  | "LECTURE_PROCESS_STARTED"
  | "LECTURE_PROCESS_COMPLETED"
  | "LECTURE_PROCESS_FAILED"
  | "LECTURE_FILE_EXPIRED"
  | "LECTURE_FILE_DELETED"
  | "LECTURE_FILE_DELETE_FAILED"
  | "CONTRIBUTION_SUBMITTED"
  | "CONTRIBUTION_REJECTED"
  | "CONTRIBUTION_APPROVED"
  | "VISION_REQUEST_STARTED"
  | "VISION_REQUEST_COMPLETED"
  | "VISION_REQUEST_FAILED";

/**
 * Structured, single-line JSON logs. Callers must only pass ids, sizes,
 * statuses and durations — never secrets, tokens or full file/message content.
 */
export function logEvent(event: LogEvent, meta: Record<string, string | number | boolean | null | undefined> = {}) {
  console.log(JSON.stringify({ event, ...meta, at: new Date().toISOString() }));
}
