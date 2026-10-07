export interface ChatFileUpload {
  conversationId: string;
  lectureId: string;
  attachmentId?: string;
  status: string;
  error?: string | null;
}
export async function waitForChatFile(
  upload: ChatFileUpload,
  getStatus: (
    conversationId: string,
    lectureId: string,
  ) => Promise<Pick<ChatFileUpload, "status" | "attachmentId" | "error">>,
  options: {
    signal?: AbortSignal;
    attempts?: number;
    delay?: (signal?: AbortSignal) => Promise<void>;
    onStatus?: (status: string) => void;
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
    if (["failed", "needs_review", "expired"].includes(current.status))
      throw new Error(
        current.error || "تعذرت معالجة الملف؛ أعد المحاولة من صفحة المادة",
      );
    if (attempt === (options.attempts ?? 300)) break;
    options.onStatus?.(current.status);
    await delay(options.signal);
    current = {
      ...current,
      ...(await getStatus(upload.conversationId, upload.lectureId)),
    };
  }
  throw new Error(
    "الملف ما زال يُجهّز. افتحه من صفحة المادة بعد قليل؛ لا تحتاج لرفعه مرة أخرى.",
  );
}
