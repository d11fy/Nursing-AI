import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getAIProvider } from "@/lib/ai";
import { searchKnowledge } from "@/lib/ai/rag";
import { checkDailyLimit, checkRateLimit, logUsage } from "@/lib/usage";
import { getSignedChatImageUrl } from "@/lib/storage";
import { sendMessageSchema } from "@/lib/validations/chat";
import type { ChatMessageInput } from "@/lib/ai/provider";

function truncateTitle(text: string, max = 60): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean || "محادثة جديدة";
}

export async function POST(request: Request) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = sendMessageSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" },
      { status: 400 }
    );
  }
  const { conversationId, content, subjectId, imagePath } = parsed.data;

  const rateLimit = await checkRateLimit(user.id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "الرجاء الانتظار قليلًا قبل إرسال سؤال آخر" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const dailyLimit = await checkDailyLimit(db, user.id);
  if (!dailyLimit.allowed) {
    return NextResponse.json(
      { error: "وصلت للحد اليومي للتجربة. يمكنك العودة غدًا." },
      { status: 403 }
    );
  }

  // Resolve or create the conversation.
  let activeConversationId = conversationId;
  let activeSubjectId = subjectId ?? null;

  if (activeConversationId) {
    const { data: existing } = await db
      .from("conversations")
      .select("id, subject_id, user_id")
      .eq("id", activeConversationId)
      .single();

    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
    }
    activeSubjectId = existing.subject_id ?? activeSubjectId;
  } else {
    const { data: created, error } = await db
      .from("conversations")
      .insert({
        user_id: user.id,
        title: truncateTitle(content),
        subject_id: activeSubjectId,
      })
      .select("id")
      .single();

    if (error || !created) {
      return NextResponse.json({ error: "تعذر إنشاء المحادثة" }, { status: 500 });
    }
    activeConversationId = created.id;
  }

  // Load recent history for context (before inserting the new user message).
  const { data: history } = await db
    .from("messages")
    .select("role, content")
    .eq("conversation_id", activeConversationId)
    .order("created_at", { ascending: true })
    .limit(20);

  let signedImageUrl: string | null = null;
  if (imagePath) {
    try {
      signedImageUrl = await getSignedChatImageUrl(db, imagePath);
    } catch {
      return NextResponse.json({ error: "تعذر تحميل الصورة" }, { status: 400 });
    }
  }

  await db.from("messages").insert({
    conversation_id: activeConversationId,
    role: "user",
    content,
    image_url: imagePath ?? null,
  });

  const provider = getAIProvider();
  const knowledge = await searchKnowledge(content, activeSubjectId, 5);

  const messages: ChatMessageInput[] = [
    ...(history ?? []).map((m) => ({ role: m.role, content: m.content }) as ChatMessageInput),
    { role: "user", content, imageUrl: signedImageUrl },
  ];

  const encoder = new TextEncoder();
  const conversationIdForClient = activeConversationId;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullContent = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let model = "";

      try {
        if (signedImageUrl) {
          const result = await provider.generateVisionResponse({
            messages,
            knowledge,
            imageUrl: signedImageUrl,
            signal: request.signal,
          });
          fullContent = result.content;
          inputTokens = result.inputTokens;
          outputTokens = result.outputTokens;
          model = result.model;
          controller.enqueue(encoder.encode(fullContent));
        } else {
          const generator = provider.generateStream({
            messages,
            knowledge,
            signal: request.signal,
          });
          let next = await generator.next();
          while (!next.done) {
            fullContent += next.value.delta;
            controller.enqueue(encoder.encode(next.value.delta));
            next = await generator.next();
          }
          inputTokens = next.value.inputTokens;
          outputTokens = next.value.outputTokens;
          model = next.value.model;
        }

        const cost = provider.calculateCost({ model, inputTokens, outputTokens });

        await db.from("messages").insert({
          conversation_id: conversationIdForClient,
          role: "assistant",
          content: fullContent,
          tokens_input: inputTokens,
          tokens_output: outputTokens,
          model,
        });

        await db
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationIdForClient);

        await logUsage({
          userId: user.id,
          type: signedImageUrl ? "vision" : "chat",
          model,
          inputTokens,
          outputTokens,
          estimatedCost: cost,
        });
      } catch (err) {
        if (fullContent) {
          // Partial content was streamed (e.g. client stopped generation) —
          // save what we have instead of losing the exchange.
          await db.from("messages").insert({
            conversation_id: conversationIdForClient,
            role: "assistant",
            content: fullContent,
            model,
          });
        } else {
          console.error("chat stream error", err);
          controller.enqueue(
            encoder.encode("صار خطأ أثناء تجهيز الإجابة، جرب مرة ثانية.")
          );
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Conversation-Id": conversationIdForClient,
      "Cache-Control": "no-store",
    },
  });
}
