import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getAIProvider } from "@/lib/ai";
import { searchKnowledge } from "@/lib/ai/rag";
import { searchLectureKnowledge } from "@/lib/ai/lecture-rag";
import { checkDailyLimit, checkRateLimit, logUsage } from "@/lib/usage";
import { getChatImageDataUri } from "@/lib/storage";
import { sendMessageSchema } from "@/lib/validations/chat";
import type { ChatMessageInput } from "@/lib/ai/provider";
import type { KnowledgeChunk } from "@/lib/ai/provider";
import { canStudentAccessSubject } from "@/lib/subjects";
import { getStudentContext, recordChatLearning, recordUnanswered, updateConversationMemory } from "@/lib/student-memory";
import { classifyQuestion, scopeResponse } from "@/lib/ai/question-policy";

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
  const { conversationId, content, subjectId, lectureId, imagePath } = parsed.data;
  if (subjectId && !await canStudentAccessSubject(user.id, subjectId)) {
    return NextResponse.json({ error: "هذه المادة غير متاحة لسنتك الدراسية." }, { status: 403 });
  }
  let lectureTitle: string | null = null;
  if (lectureId) {
    const { data: lecture } = await db.from("lectures").select("id, title, status").eq("id", lectureId).single();
    if (!lecture) return NextResponse.json({ error: "المحاضرة غير موجودة" }, { status: 404 });
    if (lecture.status !== "ready") return NextResponse.json({ error: "المحاضرة لم تجهز بعد للدراسة" }, { status: 400 });
    lectureTitle = lecture.title;
  }

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
  let activeLectureId = lectureId ?? null;

  if (activeConversationId) {
    const { data: existing } = await db
      .from("conversations")
      .select("id, subject_id, lecture_id, user_id")
      .eq("id", activeConversationId)
      .single();

    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
    }
    activeSubjectId = existing.subject_id ?? activeSubjectId;
    activeLectureId = existing.lecture_id ?? activeLectureId;
    if (activeSubjectId && !await canStudentAccessSubject(user.id, activeSubjectId)) {
      return NextResponse.json({ error: "هذه المادة غير متاحة لسنتك الدراسية." }, { status: 403 });
    }
  } else {
    const { data: created, error } = await db
      .from("conversations")
      .insert({
        user_id: user.id,
        title: truncateTitle(content),
        subject_id: activeSubjectId,
        lecture_id: activeLectureId,
      })
      .select("id")
      .single();

    if (error || !created) {
      return NextResponse.json({ error: "تعذر إنشاء المحادثة" }, { status: 500 });
    }
    activeConversationId = created.id;
  }

  if (activeLectureId && !lectureTitle) {
    const { data: lecture } = await db.from("lectures").select("id, title, status").eq("id", activeLectureId).single();
    if (!lecture || lecture.status !== "ready") return NextResponse.json({ error: "المحاضرة لم تجهز بعد للدراسة" }, { status: 400 });
    lectureTitle = lecture.title;
  }

  // Load recent history for context (before inserting the new user message).
  const { data: history } = await db
    .from("messages")
    .select("role, content")
    .eq("conversation_id", activeConversationId)
    .order("created_at", { ascending: true })
    .limit(20);
  const studentContext = await getStudentContext(user.id, activeConversationId, activeSubjectId, activeLectureId);
  const scope = classifyQuestion(content, Boolean(activeSubjectId || activeLectureId), Boolean(imagePath));

  let imageDataUri: string | null = null;
  if (imagePath) {
    try {
      imageDataUri = await getChatImageDataUri(db, imagePath);
    } catch {
      return NextResponse.json({ error: "تعذر تحميل الصورة" }, { status: 400 });
    }
  }

  let provider;
  let knowledge: KnowledgeChunk[];
  try {
    provider = getAIProvider();
    // The image already contains the source material. Avoid loading the
    // embedding model immediately before the vision model on small GPUs.
    knowledge = imageDataUri
      ? []
      : activeLectureId && lectureTitle
        ? await searchLectureKnowledge(content, activeLectureId, user.id, lectureTitle, 5)
        : await searchKnowledge(content, activeSubjectId, 5);
  } catch (error) {
    console.error("chat provider error", error);
    return NextResponse.json({ error: "خدمة الذكاء الاصطناعي غير متاحة مؤقتًا، حاول مرة أخرى بعد قليل." }, { status: 503 });
  }

  await db.from("messages").insert({
    conversation_id: activeConversationId,
    role: "user",
    content,
    image_url: imagePath ?? null,
  });

  if (!imageDataUri && scope !== "NURSING_IN_SCOPE") {
    const reason = scope === "NON_NURSING" ? "NON_NURSING" : scope === "NURSING_OUT_OF_CURRICULUM" ? "OUTSIDE_CURRICULUM" : "LOW_CONFIDENCE";
    const answer = scopeResponse[scope];
    await recordUnanswered(user.id, activeSubjectId, activeLectureId, content, reason);
    await db.from("messages").insert({ conversation_id: activeConversationId, role: "assistant", content: answer, model: "policy" });
    return new Response(answer, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": activeConversationId, "Cache-Control": "no-store" } });
  }
  if (!imageDataUri && knowledge.length === 0) {
    const answer = scopeResponse.NO_SOURCE;
    await recordUnanswered(user.id, activeSubjectId, activeLectureId, content, "NO_SOURCE");
    await db.from("messages").insert({ conversation_id: activeConversationId, role: "assistant", content: answer, model: "policy" });
    return new Response(answer, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": activeConversationId, "Cache-Control": "no-store" } });
  }

  const relevantHistory = imageDataUri ? (history ?? []).slice(-6) : (history ?? []);
  const messages: ChatMessageInput[] = [
    ...relevantHistory.map((m) => ({ role: m.role, content: m.content }) as ChatMessageInput),
    { role: "user", content, imageUrl: imageDataUri },
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
        if (imageDataUri) {
          const visionParams = {
            messages,
            knowledge,
            personalizationContext: studentContext.text,
            imageUrl: imageDataUri,
            signal: request.signal,
            maxOutputTokens: 2048,
          };
          if (provider.generateVisionStream) {
            const generator = provider.generateVisionStream(visionParams);
            let next = await generator.next();
            while (!next.done) {
              fullContent += next.value.delta;
              controller.enqueue(encoder.encode(next.value.delta));
              next = await generator.next();
            }
            inputTokens = next.value.inputTokens;
            outputTokens = next.value.outputTokens;
            model = next.value.model;
          } else {
            const result = await provider.generateVisionResponse(visionParams);
            fullContent = result.content;
            inputTokens = result.inputTokens;
            outputTokens = result.outputTokens;
            model = result.model;
            controller.enqueue(encoder.encode(fullContent));
          }
        } else {
          const generator = provider.generateStream({
            messages,
            knowledge,
            personalizationContext: studentContext.text,
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
          type: imageDataUri ? "vision" : "chat",
          model,
          inputTokens,
          outputTokens,
          estimatedCost: cost,
        });
        await recordChatLearning(user.id, activeSubjectId, activeLectureId, content);
        await updateConversationMemory(user.id, conversationIdForClient, activeSubjectId, activeLectureId, history ?? [], content);
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
          let userMsg = "خدمة الذكاء الاصطناعي غير متاحة مؤقتًا، حاول مرة أخرى بعد قليل.";
          if (err && typeof err === "object") {
            const status = (err as { status?: number; statusCode?: number }).status || (err as { status?: number; statusCode?: number }).statusCode;
            const message = String((err as { message?: string }).message || "");
            if (status === 401 || message.includes("API key") || message.includes("Incorrect API key")) {
              userMsg = "تعذر الاتصال بالذكاء الاصطناعي: مفتاح OpenAI API غير صالح أو غير محدد في السيرفر (OPENAI_API_KEY). يرجى تزويد مفتاح صالح.";
            } else if (status === 429 || message.includes("quota") || message.includes("rate limit") || message.includes("exceeded")) {
              userMsg = "تعذر الاتصال بالذكاء الاصطناعي: تم تجاوز حد الاستخدام أو نفاد الرصيد في حساب OpenAI.";
            } else if (status === 404 || message.includes("model_not_found")) {
              userMsg = "تعذر الاتصال بالذكاء الاصطناعي: النموذج المطلوب غير متوفر في حساب OpenAI.";
            }
          }
          controller.enqueue(encoder.encode(userMsg));
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
