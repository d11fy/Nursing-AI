import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/db/server";
import { getAccessibleLibraryDocument, LibraryError } from "@/lib/library";
import { downloadKnowledgeDocument } from "@/lib/storage";

const idSchema = z.string().uuid();
const contentTypes: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient();
  const user = db.actor;
  if (!user || user.status !== "active") return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) return NextResponse.json({ error: "معرّف الملف غير صالح" }, { status: 400 });
  try {
    const document = await getAccessibleLibraryDocument(user.user_id, parsedId.data);
    const content = await downloadKnowledgeDocument(document.storagePath);
    const extension = document.originalFileName.split(".").pop()?.toLowerCase() ?? "";
    const mode = new URL(request.url).searchParams.get("mode") === "download" ? "attachment" : "inline";
    const encodedName = encodeURIComponent(document.originalFileName).replace(/['()]/g, escape);
    return new Response(new Uint8Array(content), {
      headers: {
        "Content-Type": contentTypes[extension] ?? "application/octet-stream",
        "Content-Length": String(content.byteLength),
        "Content-Disposition": `${mode}; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status = error instanceof LibraryError ? error.status : 404;
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل الملف" }, { status });
  }
}
