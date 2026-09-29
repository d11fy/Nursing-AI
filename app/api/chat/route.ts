import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getAIProvider } from "@/lib/ai";
import { retrieveCurriculum } from "@/lib/ai/curriculum-search";
import { answerFromCurriculum } from "@/lib/ai/grounded-answer";
import { checkDailyLimit, checkRateLimit, logUsage } from "@/lib/usage";
import { getChatImageDataUri } from "@/lib/storage";
import { sendMessageSchema } from "@/lib/validations/chat";
import type { ChatMessageInput } from "@/lib/ai/provider";
import { canStudentAccessSubject } from "@/lib/subjects";
import { getStudentContext, recordChatLearning, recordUnanswered, updateConversationMemory } from "@/lib/student-memory";

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
  const { data: latestHistory, error: historyError } = await db
    .from("messages")
    .select("role, content")
    .eq("conversation_id", activeConversationId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (historyError) return NextResponse.json({ error: "تعذر تحميل المحادثة" }, { status: 503 });
  const history = (latestHistory ?? []).reverse();
  const studentContext = await getStudentContext(user.id, activeConversationId, activeSubjectId, activeLectureId)
    .catch(() => ({ text: "", summary: "", preferences: {} }));

  let imageDataUri: string | null = null;
  if (imagePath) {
    try {
      imageDataUri = await getChatImageDataUri(db, imagePath);
    } catch {
      return NextResponse.json({ error: "تعذر تحميل الصورة" }, { status: 400 });
    }
  }

  const provider = getAIProvider();
  const savedUser = await db.from("messages").insert({
    conversation_id: activeConversationId, role: "user", content, image_url: imagePath ?? null,
  });
  if (savedUser.error) return NextResponse.json({ error: "تعذر حفظ السؤال" }, { status: 500 });

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
      let answerSaved = false;
      let cost = 0;
      let learned = false;
      let unansweredReason: "NO_SOURCE" | "LOW_CONFIDENCE" | "OUTSIDE_CURRICULUM" | "NON_NURSING" | undefined;
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(150_000)]);

      try {
        if (imageDataUri) {
          const visionParams = {
            messages,
            knowledge: [],
            personalizationContext: studentContext.text,
            imageUrl: imageDataUri,
            signal,
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
          let embeddingCost = 0;
          let embeddingTokens = 0;
          const result = await answerFromCurriculum({ question: content, history: messages.slice(0,-1),
            personalization: studentContext.text, signal }, {
            provider,
            retrieve: queries => retrieveCurriculum(queries, {
              userId:user.id, subjectId:activeSubjectId, lectureId:activeLectureId,
            },24, result => {
              embeddingTokens += result.tokens;
              embeddingCost += provider.calculateCost({ model:result.model,inputTokens:result.tokens,outputTokens:0 });
            }),
          });
          fullContent = result.content;
          inputTokens = result.inputTokens + embeddingTokens;
          outputTokens = result.outputTokens;
          model = result.model;
          cost = result.estimatedCost + embeddingCost;
          unansweredReason = result.reason;
          learned = !result.reason && result.sources.length > 0;
          // Do not expose a draft until quote validation AND evidence audit finish.
          controller.enqueue(encoder.encode(fullContent));
        }
        if (imageDataUri) cost = provider.calculateCost({ model,inputTokens,outputTokens });

        const savedAnswer = await db.from("messages").insert({
          conversation_id: conversationIdForClient,
          role: "assistant",
          content: fullContent,
          tokens_input: inputTokens,
          tokens_output: outputTokens,
          model,
        });

        if (savedAnswer.error) throw new Error("Could not persist answer");
        answerSaved = true;

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
        // A telemetry/memory failure must never duplicate an already-saved assistant message.
        try {
          if (unansweredReason) await recordUnanswered(user.id,activeSubjectId,activeLectureId,content,unansweredReason);
          if (learned) await recordChatLearning(user.id, activeSubjectId, activeLectureId, content);
          await updateConversationMemory(user.id, conversationIdForClient, activeSubjectId, activeLectureId, history, content);
        } catch { console.error("Could not update study memory"); }
      } catch (err) {
        if (fullContent && !answerSaved) {
          // Partial content was streamed (e.g. client stopped generation) —
          // save what we have instead of losing the exchange.
          await db.from("messages").insert({
            conversation_id: conversationIdForClient,
            role: "assistant",
            content: fullContent,
            model,
          });
        } else if (!answerSaved) {
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
