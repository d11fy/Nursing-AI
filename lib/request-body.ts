// Bound streamed/chunked multipart requests too, not just Content-Length.
export async function limitedFormData(request: Request, maximum: number) {
  const size = Number(request.headers.get("content-length"));
  if (Number.isFinite(size) && size > maximum) throw new Error("حجم الملف كبير جدًا");
  if (!request.body) throw new Error("لم يتم إرفاق ملف");
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximum) { await reader.cancel(); throw new Error("حجم الملف كبير جدًا"); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = Buffer.concat(parts);
  return new Response(body, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
}
