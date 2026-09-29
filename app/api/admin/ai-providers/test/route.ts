import { NextResponse } from "next/server";
import { getAdminProfileOrNull } from "@/lib/auth";
import { getProviderByName } from "@/lib/ai/router";
import { createSystemClient } from "@/lib/db/server";

export async function POST(request: Request) {
  const admin = await getAdminProfileOrNull();
  if (!admin) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  if (!json || typeof json !== "object") {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const { action, provider, question } = json as {
    action: "health" | "manual_test";
    provider: string;
    question?: string;
  };

  if (!provider) {
    return NextResponse.json({ error: "اسم المزود مطلوب" }, { status: 400 });
  }

  const p = getProviderByName(provider);

  if (action === "health") {
    const health = await p.healthCheck();
    // Persist health status in DB
    try {
      const db = createSystemClient();
      const { data: existing } = await db.from("ai_provider_settings").select("provider").eq("provider", provider).maybeSingle();
      const payload = {
        provider: provider as import("@/types/database").AIProviderName,
        status: health.status,
        last_error: health.lastError ?? null,
        last_error_at: health.lastError ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };
      if (existing) {
        await db.from("ai_provider_settings").update(payload).eq("provider", provider);
      } else {
        await db.from("ai_provider_settings").insert(payload);
      }
    } catch {
      // Ignore DB error if DB client not ready
    }

    return NextResponse.json(health);
  }

  if (action === "manual_test") {
    if (!question?.trim()) {
      return NextResponse.json({ error: "السؤال مطلوب للتجربة" }, { status: 400 });
    }

    const start = Date.now();
    try {
      const result = await p.generateText({
        taskPrompt: "You are testing the AI provider connectivity for Nursing AI administration. Respond briefly in Arabic.",
        messages: [{ role: "user", content: question }],
        maxOutputTokens: 500,
      });

      const latencyMs = Date.now() - start;
      return NextResponse.json({
        success: true,
        provider,
        model: result.model,
        content: result.content,
        latencyMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({
        success: false,
        provider,
        latencyMs,
        error: msg,
      });
    }
  }

  return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
}
