// Content checks for uploads. Extensions and browser-reported MIME types are
// client-controlled, so the bytes must match the declared format before any
// file is stored, charged against a quota or handed to a parser.

export type UploadKind = "pdf" | "docx" | "pptx" | "txt" | "jpeg" | "png" | "webp";

export const KIND_MIME: Record<UploadKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const MIME_KIND = new Map<string, UploadKind>([
  ...Object.entries(KIND_MIME).map(([kind, mime]) => [mime, kind as UploadKind] as const),
  ["image/jpg", "jpeg"],
]);

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return bytes.length >= offset + signature.length && signature.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return Buffer.from(bytes.subarray(start, Math.min(end, bytes.length))).toString("latin1");
}

function zipContains(bytes: Uint8Array, entry: string) {
  // OOXML entry names are stored uncompressed in the zip headers.
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes(Buffer.from(entry, "latin1"));
}

function looksLikeText(bytes: Uint8Array) {
  const sample = bytes.subarray(0, 64 * 1024);
  if (sample.includes(0)) return false;
  try {
    // A truncated sample may split a multi-byte character; trim to a boundary.
    let end = sample.length;
    while (end > 0 && end > sample.length - 4 && (sample[end - 1] & 0xc0) === 0x80) end--;
    if (end > 0 && sample[end - 1] >= 0xc0) end--;
    new TextDecoder("utf-8", { fatal: true }).decode(sample.subarray(0, end));
    return true;
  } catch {
    return false;
  }
}

/** Identifies the real format from the leading bytes, or null when unsupported. */
export function detectUploadKind(bytes: Uint8Array): UploadKind | null {
  if (ascii(bytes, 0, 1024).includes("%PDF-")) return "pdf";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && zipContains(bytes, "[Content_Types].xml")) {
    if (zipContains(bytes, "word/document.xml")) return "docx";
    if (zipContains(bytes, "ppt/presentation.xml")) return "pptx";
    return null;
  }
  if (bytes.length && looksLikeText(bytes)) return "txt";
  return null;
}

export type ContentCheck =
  | { ok: true; kind: UploadKind; mime: string }
  | { ok: false; reason: "empty" | "unsupported" | "mismatch" };

/**
 * Verifies that the bytes are one of the allowed kinds and agree with the
 * declared MIME type (when the client sent a specific one).
 */
export function verifyUploadContent(bytes: Uint8Array, declaredMime: string, allowed: readonly UploadKind[]): ContentCheck {
  if (!bytes.length) return { ok: false, reason: "empty" };
  const detected = detectUploadKind(bytes);
  if (!detected || !allowed.includes(detected)) return { ok: false, reason: "unsupported" };
  const declared = MIME_KIND.get(declaredMime.toLowerCase());
  if (declaredMime && declaredMime !== "application/octet-stream" && declared !== detected) return { ok: false, reason: "mismatch" };
  return { ok: true, kind: detected, mime: KIND_MIME[detected] };
}

export const DOCUMENT_KINDS = ["pdf", "docx", "pptx", "txt"] as const satisfies readonly UploadKind[];
export const IMAGE_KINDS = ["jpeg", "png", "webp"] as const satisfies readonly UploadKind[];
export const LECTURE_KINDS = [...DOCUMENT_KINDS, ...IMAGE_KINDS] as const;
export const RECEIPT_KINDS = ["pdf", "jpeg", "png", "webp"] as const satisfies readonly UploadKind[];

export const UPLOAD_REJECTION_MESSAGE: Record<"empty" | "unsupported" | "mismatch", string> = {
  empty: "الملف فارغ",
  unsupported: "محتوى الملف لا يطابق صيغة مدعومة",
  mismatch: "امتداد الملف أو نوعه لا يطابق محتواه الفعلي",
};
