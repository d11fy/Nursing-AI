import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { routeAIRequest, getProviderByName, classifyRequest } from "@/lib/ai";
import { retrieveCurriculum } from "@/lib/ai/curriculum-search";
import { answerFromCurriculum } from "@/lib/ai/grounded-answer";
import { checkDailyLimit, checkRateLimit, logUsage, getMonthlyAiSpend, getSettings } from "@/lib/usage";
import { getChatImageDataUri } from "@/lib/storage";
import { sendMessageSchema } from "@/lib/validations/chat";
import type { ChatMessageInput } from "@/lib/ai/provider";
import { canStudentAccessSubject } from "@/lib/subjects";
import { getStudentContext, recordChatLearning, recordUnanswered, updateConversationMemory } from "@/lib/student-memory";
import {
  analyzeConversationAttachment,
  attachmentEvidence,
  loadConversationAttachments,
  persistResolvedAttachmentState,
  resolveConversationReference,
  saveAITrace,
} from "@/lib/ai/conversation-context";

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

  const { data: savedUser, error: savedUserError } = await db.from("messages").insert({
    conversation_id: activeConversationId, role: "user", content, image_url: imagePath ?? null,
  }).select("id").single();
  if (savedUserError || !savedUser) return NextResponse.json({ error: "تعذر حفظ السؤال" }, { status: 500 });

  const preparationSignal = AbortSignal.any([request.signal, AbortSignal.timeout(150_000)]);
  let newAttachmentCacheHit = false;
  if (imageDataUri && imagePath) {
    try {
      const visionProvider = getProviderByName("openai");
      const analyzed = await analyzeConversationAttachment({
        conversationId:activeConversationId,messageId:savedUser.id,userId:user.id,filePath:imagePath,
        imageDataUri,subjectId:activeSubjectId,lectureId:activeLectureId,provider:visionProvider,signal:preparationSignal,
      });
      newAttachmentCacheHit = analyzed.cacheHit;
      if (!analyzed.cacheHit) {
        await logUsage({
          userId:user.id,type:"vision",feature:"vision_extraction",model:analyzed.attachment.model ?? "unknown",
          provider:analyzed.attachment.provider,inputTokens:analyzed.attachment.input_tokens,
          outputTokens:analyzed.attachment.output_tokens,
          estimatedCost:visionProvider.calculateCost({model:analyzed.attachment.model ?? "",inputTokens:analyzed.attachment.input_tokens,outputTokens:analyzed.attachment.output_tokens}),
          success:true,fallbackUsed:false,
        });
      }
    } catch (error) {
      console.error("vision extraction failed", error);
      return NextResponse.json({ error: "تعذر فهم الصورة المرفوعة. تأكد أن الصورة واضحة ثم حاول مرة أخرى." }, { status: 422 });
    }
  }
  const attachmentState = await loadConversationAttachments(activeConversationId,user.id);
  const resolved = resolveConversationReference({
    question:content,attachments:attachmentState.attachments,activeAttachmentId:attachmentState.activeAttachmentId,
    activeSectionIndex:attachmentState.activeSectionIndex,history:history as ChatMessageInput[],conversationSummary:studentContext.summary,
  });
  const activeResolvedAttachment = resolved.selectedAttachments[0] ?? null;
  if (activeResolvedAttachment) await persistResolvedAttachmentState({
    conversationId:activeConversationId,userId:user.id,attachmentId:activeResolvedAttachment.id,sectionIndex:resolved.selectedSectionIndex,
  });
  const attachmentSources = attachmentEvidence(resolved);
  const relevantHistory = (history ?? []).slice(-10);
  const messages: ChatMessageInput[] = [
    ...relevantHistory.map((m) => ({ role: m.role, content: m.content }) as ChatMessageInput),
    { role: "user", content },
  ];

  const encoder = new TextEncoder();
  const conversationIdForClient = activeConversationId;

  // Fast scope classification before stream
  const classification = await classifyRequest({
    question: resolved.resolvedQuestion,
    hasImage: false,
    feature: "chat",
    subjectId: activeSubjectId,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullContent = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let model = "";
      let providerUsed = "openai";
      let fallbackUsed = false;
      let fallbackFrom: string | undefined;
      let fallbackReason: string | undefined;
      let answerSaved = false;
      let cost = 0;
      let learned = false;
      let unansweredReason: "NO_SOURCE" | "LOW_CONFIDENCE" | "OUTSIDE_CURRICULUM" | "NON_NURSING" | undefined;
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(150_000)]);
      const startTimer = Date.now();
      let traceResult: Awaited<ReturnType<typeof answerFromCurriculum>> | null = null;

      try {
        let embeddingCost = 0;
        let embeddingTokens = 0;
        const retrievedSources = await retrieveCurriculum(resolved.searchQueries, {
          userId:user.id,subjectId:activeSubjectId,lectureId:activeLectureId,
        },15,(embedding) => {
          embeddingTokens += embedding.tokens;
          embeddingCost += getProviderByName("openai").calculateCost({model:embedding.model,inputTokens:embedding.tokens,outputTokens:0});
        }).catch((error) => {
          if (!attachmentSources.length) throw error;
          console.error("curriculum retrieval failed; continuing with current upload", error);
          return [];
        });
        if (classification.scope === "NON_NURSING" && attachmentSources.length === 0 && retrievedSources.length === 0) {
          fullContent = "أنا مخصص فقط لمساعدتك في دراسة مواد التمريض والمصادر التعليمية المتاحة في المنصة.";
          unansweredReason = "NON_NURSING";
          controller.enqueue(encoder.encode(fullContent));
        }
        const appSettings = await getSettings(db);
        const { totalCost: currentMonthCost } = await getMonthlyAiSpend(db);
        const budgetRatio = appSettings.monthlyAiBudget > 0 ? currentMonthCost / appSettings.monthlyAiBudget : 0;
        if (!fullContent) {
          // Routing happens only after attachment and curriculum evidence have been collected.
          const sourceConfidence = attachmentSources.length ? 1 : Math.max(0,...retrievedSources.map((source)=>source.similarity));
          const route = routeAIRequest({
            feature:"chat",complexity:classification.complexity,hasImage:false,
            containsSensitiveData:classification.containsSensitiveData,budgetRatio,sourceConfidence,
          });
          const primaryProvider = getProviderByName(route.provider);
          const fallbackProviders = route.fallbackProviders.map(getProviderByName);
          providerUsed = primaryProvider.name;
          const result = await answerFromCurriculum({
            question: content,
            resolvedQuestion:resolved.resolvedQuestion,
            searchQueries:resolved.searchQueries,
            history: messages.slice(0, -1),
            personalization: studentContext.text,
            attachmentSources,
            style:resolved.style,
            signal,
          }, {
            provider: primaryProvider,
            fallbackProviders,
            retrieve: async () => retrievedSources,
          });
          traceResult = result;
          fullContent = result.content;
          inputTokens = result.inputTokens + embeddingTokens;
          outputTokens = result.outputTokens;
          model = result.model;
          providerUsed = result.provider || primaryProvider.name;
          fallbackUsed = result.fallbackUsed || false;
          fallbackFrom = result.fallbackFrom;
          fallbackReason = result.fallbackReason;
          cost = result.estimatedCost + embeddingCost;
          unansweredReason = result.reason;
          learned = !result.reason && result.sources.length > 0;
          controller.enqueue(encoder.encode(fullContent));
        }

        const { data: savedAnswer, error: savedAnswerError } = await db.from("messages").insert({
          conversation_id: conversationIdForClient,
          role: "assistant",
          content: fullContent,
          tokens_input: inputTokens,
          tokens_output: outputTokens,
          model,
        }).select("id").single();

        if (savedAnswerError || !savedAnswer) throw new Error("Could not persist answer");
        answerSaved = true;

        await saveAITrace({
          messageId:savedAnswer.id,conversationId:conversationIdForClient,userId:user.id,resolvedQuery:resolved.resolvedQuestion,
          detectedSubject:activeResolvedAttachment?.vision_structured_json.subject_guess,
          activeAttachmentId:activeResolvedAttachment?.id,attachmentIds:resolved.selectedAttachments.map((attachment)=>attachment.id),
          retrievedSources:(traceResult?.initialSources ?? []).map((source)=>({id:source.id,documentId:source.documentId,
            attachmentId:source.attachmentId,title:source.title,type:source.evidenceType,similarity:source.similarity,page:source.pageNumber})),
          rerankedSources:(traceResult?.sources ?? []).map((source)=>({id:source.id,documentId:source.documentId,
            attachmentId:source.attachmentId,title:source.title,type:source.evidenceType,similarity:source.similarity,page:source.pageNumber})),
          evidenceCoverage:traceResult?.evidenceCoverage ?? "UNSUPPORTED",selectedProvider:providerUsed,selectedModel:model,
          fallbackUsed,finalSourceIds:traceResult?.finalSourceIds ?? [],refusalReason:unansweredReason ?? null,
          diagnostics:{referenceResolved:resolved.referenceResolved,style:resolved.style,initialCount:traceResult?.initialSources.length ?? 0,
            rerankedCount:traceResult?.sources.length ?? 0,visionCacheHit:newAttachmentCacheHit,classification:classification.scope},
        });

        await db
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationIdForClient);

        const latencyMs = Date.now() - startTimer;
        await logUsage({
          userId: user.id,
          type: "chat",
          feature: "chat",
          model,
          provider: providerUsed,
          inputTokens,
          outputTokens,
          estimatedCost: cost,
          latencyMs,
          fallbackUsed,
          fallbackFrom,
          fallbackReason,
          success: true,
          isFreeTier: providerUsed === "gemini" && process.env.ALLOW_FREE_TIER_PRIVATE_CONTENT === "true",
        });

        try {
          if (unansweredReason) await recordUnanswered(user.id, activeSubjectId, activeLectureId, content, unansweredReason);
          if (learned) await recordChatLearning(user.id, activeSubjectId, activeLectureId, content);
          const topic = activeResolvedAttachment?.vision_structured_json.topic;
          await updateConversationMemory(user.id, conversationIdForClient, activeSubjectId, activeLectureId, history,
            topic ? `${content} [الصورة النشطة: ${topic}${resolved.selectedSectionIndex ? `، الجزء ${resolved.selectedSectionIndex}` : ""}]` : content);
        } catch { console.error("Could not update study memory"); }
      } catch (err) {
        if (fullContent && !answerSaved) {
          await db.from("messages").insert({
            conversation_id: conversationIdForClient,
            role: "assistant",
            content: fullContent,
            model,
          });
        } else if (!answerSaved) {
          console.error("chat stream error", err);
          let userMsg = "تعذر تجهيز الإجابة حاليًا. حاول مرة أخرى بعد قليل.";
          if (err && typeof err === "object") {
            const status = (err as { status?: number; statusCode?: number }).status || (err as { status?: number; statusCode?: number }).statusCode;
            const message = String((err as { message?: string }).message || "");
            if (status === 401 || message.includes("API key") || message.includes("Incorrect API key")) {
              userMsg = "تعذر الاتصال بالذكاء الاصطناعي بسبب خطأ في الإعدادات. يرجى مراجعة إدارة المنصة.";
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
