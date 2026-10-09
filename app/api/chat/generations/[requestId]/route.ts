import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/db/server";
import { chatErrorMessage, type ChatErrorCode } from "@/lib/chat/errors";
import { failStaleGeneration, findGeneration, loadAssistantMessage } from "@/lib/tutor/generations";
import { cancelGeneration } from "@/lib/tutor/chat";
import { logEvent } from "@/lib/log";

export const runtime = "nodejs";
const idSchema = z.string().uuid();
const noStore = { "Cache-Control": "no-store" };

/**
 * Where is this answer? The phone calls this after a dropped connection (or when the app returns from the
 * background). The server is the source of truth: a completed answer is returned even if the stream never reached the phone.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const db = await createClient();
  const user = db.actor;
  if (!user || user.status !== "active") return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const { requestId } = await params;
  if (!idSchema.safeParse(requestId).success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const found = await findGeneration(user.user_id, requestId);
  if (!found) {
    // The question never reached the server, so sending it again is safe and costs nothing extra.
    return NextResponse.json({ requestId, status: "not_found", code: "GENERATION_NOT_FOUND", error: chatErrorMessage("GENERATION_NOT_FOUND"), retryable: true }, { status: 404, headers: noStore });
  }
  const generation = await failStaleGeneration(user.user_id, found);
  const message = generation.status === "completed" ? await loadAssistantMessage(user.user_id, generation) : null;
  const code = generation.status === "failed" || generation.status === "cancelled" ? ((generation.error_code as ChatErrorCode | null) ?? "INTERNAL") : null;
  logEvent("GENERATION_POLLED", { requestId, generationStatus: generation.status });
  return NextResponse.json({
    requestId, generationId: generation.id, status: generation.status, conversationId: generation.conversation_id, userMessageId: generation.user_message_id,
    assistantMessage: message, error: code ? { code, message: chatErrorMessage(code) } : null,
    retryable: generation.status === "failed" || generation.status === "cancelled",
  }, { headers: noStore });
}

/** The Stop button. A dropped connection never cancels; only this call does. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const db = await createClient();
  const user = db.actor;
  if (!user || user.status !== "active") return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const { requestId } = await params;
  if (!idSchema.safeParse(requestId).success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const generation = await findGeneration(user.user_id, requestId);
  if (!generation) return NextResponse.json({ cancelled: false }, { status: 404, headers: noStore });
  const cancelled = generation.status === "pending" || generation.status === "streaming" ? cancelGeneration(generation.id) : false;
  return NextResponse.json({ cancelled, status: generation.status }, { headers: noStore });
}
