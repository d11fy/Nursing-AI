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
            imageUrl: imageDataUri,
            signal: request.signal,
            maxOutputTokens: 260,
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
            encoder.encode("خدمة الذكاء الاصطناعي غير متاحة مؤقتًا، حاول مرة أخرى بعد قليل.")
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
