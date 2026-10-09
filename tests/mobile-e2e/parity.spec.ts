import { test, expect, type Page } from "@playwright/test";
const subjectId = "10000000-0000-4000-8000-000000000001";
const resourceId = "20000000-0000-4000-8000-000000000001";
const packId = "30000000-0000-4000-8000-000000000001";
const conversationId = "40000000-0000-4000-8000-000000000001";
const quizId = "50000000-0000-4000-8000-000000000001";
const attemptId = "60000000-0000-4000-8000-000000000001";
const lectureId = "70000000-0000-4000-8000-000000000001";
const resource = {
  id: resourceId,
  title: "أساسيات التمريض",
  description: "مرجع السنة الأولى",
  category: "curriculum_book",
  subjectId,
  subjectName: "أساسيات التمريض",
  academicYearId: null,
  academicYearName: null,
  semester: 1,
  language: "ar",
  sourceLabel: "الجامعة",
  pageCount: 20,
  sortOrder: 0,
  favorite: false,
};
const access = {
  active: true,
  kind: "paid",
  planName: "باقة الطالب",
  daysRemaining: 20,
  endsAt: "2026-12-01",
  entitlements: {},
};
const summary = {
  overview: "ملخص محاضرة التمريض",
  main_concepts: [
    {
      concept: "Oxygen",
      explanation: "مفهوم الأكسجين",
      arabic_term: "الأكسجين",
    },
  ],
  important_definitions: [
    { term: "Pulse", arabic_translation: "النبض", definition: "تعريف النبض" },
  ],
  clinical_notes: [{ note: "ملاحظة سريرية", importance: "هامة" }],
  what_to_remember: ["تذكر مراقبة العلامات الحيوية"],
  source_references: ["صفحة 1"],
};
// Server contract: questions never carry the answer key; it arrives from the
// answer endpoint after the answer is recorded.
const question = {
  id: "80000000-0000-4000-8000-000000000001",
  question: "ما التدخل الأول؟",
  options: ["تقييم المريض", "تجاهل المريض"],
  topic: "التقييم",
};
const answerFeedback = {
  isCorrect: true,
  correctAnswer: "تقييم المريض",
  rationale: "ابدأ بالتقييم",
  topic: "التقييم",
};
async function setup(page: Page, authenticated = true) {
  const requests: {
    path: string;
    method: string;
    body: string;
    headers: Record<string, string>;
  }[] = [];
  let polls = 0;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (authenticated)
    await page.addInitScript(() => {
      sessionStorage.setItem("nursing_mobile_session_token", "test-session");
      localStorage.setItem(
        "CapacitorStorage.nursing_mobile_device_token",
        "test-device",
      );
    });
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      p = url.pathname,
      method = request.method();
    requests.push({
      path: p + url.search,
      method,
      body: request.postData() || "",
      headers: request.headers(),
    });
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (p === "/api/app/version")
      return json({ latest_version: "1.0.1", latest_version_code: 2 });
    if (p === "/api/auth/me")
      return json({
        authenticated: true,
        profile: {
          user_id: "user",
          full_name: "طالب التمريض",
          email: "student@example.com",
          university: "الجامعة",
          nursing_year: "year1",
          role: "student",
          status: "active",
        },
        access,
        aiUsage: { used: 2, limit: 20 },
      });
    if (p === "/api/auth/forgot-password")
      return json({
        message: "إذا كان البريد مسجلاً، ستصلك رسالة لإعادة تعيين كلمة المرور.",
      });
    if (p === "/api/auth/register" || p === "/api/auth/login")
      return json({
        success: true,
        sessionToken: "new-session",
        deviceToken: "device",
      });
    if (p === "/api/conversations") return json({ conversations: [] });
    if (p === `/api/conversations/${conversationId}`)
      return json({
        conversation: { id: conversationId, subject_id: subjectId },
        messages: [],
        activeSources: [resource],
      });
    if (p === "/api/subjects")
      return json({
        subjects: [
          {
            id: subjectId,
            name_ar: "أساسيات التمريض",
            name_en: "Fundamentals",
            semester: 1,
          },
        ],
        academicYearName: "السنة الأولى",
      });
    if (p === `/api/subjects/${subjectId}`)
      return json({
        subject: { id: subjectId, name_ar: "أساسيات التمريض" },
        lectures: [],
        pastExams: [],
        settings: { lectureLargeFileMb: 20, lectureMaxFileMb: 30 },
      });
    if (p === "/api/library")
      return json({
        resources: [resource],
        recent: [],
        subjects: [
          { id: subjectId, name: "أساسيات التمريض", semester: 1, count: 1 },
        ],
        categoryCounts: { curriculum_book: 1 },
        academicYear: { id: "year", name: "السنة الأولى" },
        total: 1,
        page: 1,
        pageSize: 18,
      });
    if (p === "/api/library/favorites") return json({ ok: true });
    if (p === `/api/library/${resourceId}/study-pack`)
      return json({ studyPackId: packId });
    if (p === "/api/library/sources")
      return json({ conversationId, source: resource });
    if (p === `/api/library/${resourceId}/file`)
      return route.fulfill({
        contentType: "application/pdf",
        headers: {
          "Content-Disposition": "inline; filename*=UTF-8''reference.pdf",
        },
        body: "%PDF-1.4\n%%EOF",
      });
    if (p === "/api/learning-progress")
      return json({ topics: [], weakTopics: [] });
    if (p === "/api/learning-progress/mistakes")
      return json({
        mistakes: [
          {
            id: "mistake",
            subjectName: "أساسيات التمريض",
            topic: "التقييم",
            question: "ما التدخل الأول؟",
            options: question.options,
            studentAnswer: "تجاهل المريض",
            correctAnswer: "تقييم المريض",
            rationale: "ابدأ بالتقييم",
            wrongCount: 1,
            status: "new",
          },
        ],
        subjects: [],
        currentCount: 1,
      });
    if (p === "/api/learning-progress/mistakes/mistake/review")
      return json({ isCorrect: true, status: "reviewing" });
    if (p === "/api/profile/preferences")
      return json(
        method === "GET"
          ? {
              explanation_language: "ar",
              keep_medical_terms_english: true,
              explanation_depth: "normal",
              preferred_format: "mixed",
            }
          : { ok: true },
      );
    if (p === "/api/subscription")
      return json({
        access,
        usage: [{ key: "ai_questions_daily", used: 2, limit: 20 }],
        plans: [
          {
            id: packId,
            name: "الباقة الشهرية",
            price: 10,
            currency: "USD",
            duration_days: 30,
            description: "باقة الدراسة",
            recommended: true,
          },
        ],
        methods: [
          {
            id: resourceId,
            name: "حوالة بنكية",
            account_holder: "Nursing AI",
            account_number: "123456",
            instructions: "أرفق إيصال الدفع",
          },
        ],
        payments: [],
        history: [],
      });
    if (p === "/api/subscription/payments")
      return json({ reference: "PAY-123" });
    if (p === `/api/study-packs/${packId}`)
      return json({
        workspaceData: {
          sourceKind: "library",
          studyPack: { id: packId },
          lecture: { id: resourceId, title: resource.title, status: "ready" },
          subject: { id: subjectId, nameAr: resource.subjectName },
          pages: [{ pageNumber: 1, text: "نص الصفحة الأصلية" }],
          summaryStatus: "ready",
          keyPointsStatus: "ready",
          initialSummary: summary,
          initialKeyPoints: {
            points: [
              {
                category: "exam_focus",
                point: "نقطة مهمة",
                arabic_clarification: "شرح النقطة",
              },
            ],
          },
        },
      });
    if (p === `/api/study-packs/${packId}/flashcards`)
      return json({
        cards: [
          {
            id: "card",
            front: "سؤال البطاقة",
            back: "جواب البطاقة",
            explanation: "شرح البطاقة",
          },
        ],
      });
    if (p === `/api/study-packs/${packId}/flashcards/progress`)
      return json({ status: "known" });
    if (p === `/api/study-packs/${packId}/quiz`)
      return json({
        quiz: { id: quizId, title: "اختبار المحاضرة", questions: [question] },
      });
    if (p === `/api/study-packs/${packId}/quiz/attempt`)
      return json(
        url.searchParams.get("action") === "start"
          ? { id: attemptId }
          : url.searchParams.get("action") === "answer"
            ? answerFeedback
            : {
                score: 100,
                correctCount: 1,
                totalQuestions: 1,
                review: [
                  {
                    questionId: question.id,
                    studentAnswer: "تقييم المريض",
                    ...answerFeedback,
                  },
                ],
              },
      );
    if (p === "/api/chat/files")
      return json(
        method === "POST"
          ? { conversationId, lectureId, status: "processing" }
          : {
              status: ++polls >= 2 ? "ready" : "processing",
              attachmentId: polls >= 2 ? "attachment" : undefined,
            },
        method === "POST" ? 202 : 200,
      );
    if (p === "/api/chat")
      return route.fulfill({
        contentType: "text/event-stream",
        headers: { "X-Conversation-Id": conversationId },
        body: 'event: delta\ndata: {"text":"### شرح الملف\\n\\n**نقطة مهمة**\\n\\n- بند تعليمي"}\n\nevent: persisted\ndata: {"messageId":"message","userMessageId":"question"}\n\n',
      });
    if (p === "/api/feedback") return json({ ok: true });
    return json({ error: `Unhandled mock: ${method} ${p}` }, 500);
  });
  await page.goto("/");
  return { requests, errors };
}
test("login recovery and registration return to the student home", async ({
  page,
}) => {
  const { requests, errors } = await setup(page, false);
  await expect(
    page.getByRole("button", { name: "المتابعة باستخدام Google" }),
  ).toBeVisible();
  await page
    .getByPlaceholder("student@example.com")
    .fill("student@example.com");
  await page.getByRole("button", { name: "نسيت كلمة المرور؟" }).click();
  await expect(
    page.getByText(
      "إذا كان البريد مسجلاً، ستصلك رسالة لإعادة تعيين كلمة المرور.",
    ),
  ).toBeVisible();
  expect(
    requests.find((r) => r.path === "/api/auth/forgot-password")?.method,
  ).toBe("POST");
  await page.getByRole("button", { name: "إنشاء حساب جديد" }).click();
  await page.locator('input[type="text"]').first().fill("طالب تمريض");
  await page.locator('input[type="email"]').fill("student@example.com");
  await page.locator('input[type="password"]').fill("password123");
  await page.getByRole("button", { name: "إنشاء الحساب", exact: true }).click();
  await expect(page.getByText("لوحة الطالب", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test("library matches API categories, favorites, preview and chat source selection", async ({
  page,
}) => {
  const { requests, errors } = await setup(page);
  await page.getByRole("button", { name: "المكتبة", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: resource.title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "كتب المنهج", exact: true }).click();
  await expect
    .poll(() =>
      requests.some((r) => r.path.includes("category=curriculum_book")),
    )
    .toBe(true);
  await page.getByRole("button", { name: "إضافة للمفضلة" }).click();
  await expect(
    page.getByRole("button", { name: "إزالة من المفضلة" }),
  ).toBeVisible();
  expect(
    JSON.parse(requests.find((r) => r.path === "/api/library/favorites")!.body),
  ).toEqual({ documentId: resourceId, favorite: true });
  await page.getByRole("button", { name: "معاينة", exact: true }).click();
  await expect
    .poll(() => requests.some((r) => r.path.includes("/file?mode=preview")))
    .toBe(true);
  expect(
    requests.find((r) => r.path.includes("/file?"))?.headers.authorization,
  ).toBe("Bearer test-session");
  await page.getByRole("button", { name: "ادرس مع المعلم" }).click();
  await expect(page.getByLabel("رسالتك للمعلم")).toBeVisible();
  await expect(page.getByLabel(`إزالة ${resource.title}`)).toBeVisible();
  await page.getByLabel("رسالتك للمعلم").fill("اشرح المصدر");
  await page.getByRole("button", { name: "إرسال", exact: true }).click();
  await expect(page.getByRole("heading", { name: "شرح الملف" })).toBeVisible();
  await expect(page.getByRole("button", { name: "إجابة مفيدة" })).toBeVisible();
  await page.getByRole("button", { name: "إجابة مفيدة" }).click();
  expect(
    JSON.parse(requests.find((r) => r.path === "/api/feedback")!.body)
      .messageId,
  ).toBe("message");
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});
test("document upload selects a subject and blocks sending until processing finishes", async ({
  page,
}) => {
  const { requests, errors } = await setup(page);
  await page.getByRole("button", { name: "المحادثة مع AI" }).click();
  await page.getByRole("button", { name: "ملف", exact: true }).click();
  await page.getByRole("button", { name: "تأكيد المادة" }).click();
  await page.locator('input[accept=".pdf,.docx,.pptx,.txt"]').setInputFiles({
    name: "lecture.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Nursing lecture"),
  });
  await expect(
    page.getByRole("button", { name: "إرسال", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("lecture.txt", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: "إرسال", exact: true }).click();
  await expect(page.getByRole("heading", { name: "شرح الملف" })).toBeVisible();
  const body = JSON.parse(requests.find((r) => r.path === "/api/chat")!.body);
  expect(body.attachmentId).toBe("attachment");
  expect(body.lectureId).toBe(lectureId);
  expect(body.subjectId).toBe(subjectId);
  expect(
    requests.filter((r) => r.path.startsWith("/api/chat/files?")).length,
  ).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});
test("subscription submits a real multipart receipt with the selected plan and method", async ({
  page,
}) => {
  const { requests, errors } = await setup(page);
  await page.getByRole("button", { name: "عرض الباقات والاستخدام" }).click();
  await expect(
    page.getByRole("heading", { name: "باقة الطالب" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "اختيار الباقة وإرسال الدفع" })
    .click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "receipt.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%%EOF"),
  });
  await page.getByRole("button", { name: "إرسال الطلب للمراجعة" }).click();
  await expect(page.getByText("PAY-123", { exact: true })).toBeVisible();
  const request = requests.find(
    (r) => r.path === "/api/subscription/payments",
  )!;
  expect(request.body).toContain(packId);
  expect(request.body).toContain(resourceId);
  expect(request.body).toContain('name="receipt"');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "/tmp/nursing-mobile-subscription.png",
    fullPage: false,
  });
  expect(errors).toEqual([]);
});
test("study pack renders all summary fields and records flashcards and quizzes using website contracts", async ({
  page,
}) => {
  const { requests, errors } = await setup(page);
  await page.getByRole("button", { name: "المكتبة", exact: true }).click();
  await page.getByRole("button", { name: "حزمة الدراسة", exact: true }).click();
  await expect(page.getByText("مفهوم الأكسجين", { exact: true })).toBeVisible();
  await expect(page.getByText("تعريف النبض", { exact: true })).toBeVisible();
  await expect(page.getByText("ملاحظة سريرية", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "النص الأصلي وصفحات الملف" }).click();
  await expect(
    page.getByText("نص الصفحة الأصلية", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /البطاقات \(/ }).click();
  await page.getByRole("button", { name: "قلب البطاقة" }).click();
  await page.getByRole("button", { name: "أتقنتها", exact: true }).click();
  await expect
    .poll(() => requests.some((r) => r.path.endsWith("/flashcards/progress")))
    .toBe(true);
  expect(
    JSON.parse(
      requests.find((r) => r.path.endsWith("/flashcards/progress"))!.body,
    ),
  ).toEqual({ flashcardId: "card", status: "known" });
  await page.getByRole("button", { name: "اختبار سريع", exact: true }).click();
  await page.getByRole("button", { name: "بدء الاختبار الآن" }).click();
  const generation = JSON.parse(
    requests.find((r) => r.path.endsWith("/quiz") && r.method === "POST")!.body,
  );
  expect(generation).toEqual({
    questionCount: 10,
    difficulty: "medium",
    questionType: "mixed",
  });
  await page.getByRole("button", { name: "تقييم المريض", exact: true }).click();
  await page.getByRole("button", { name: "تأكيد الإجابة وعرض الشرح" }).click();
  await expect(page.getByText("إجابة صحيحة", { exact: true })).toBeVisible();
  await expect(page.getByText("ابدأ بالتقييم", { exact: true })).toBeVisible();
  expect(
    JSON.parse(requests.find((r) => r.path.endsWith("?action=answer"))!.body),
  ).toEqual({
    attemptId,
    questionId: question.id,
    studentAnswer: "تقييم المريض",
  });
  await page.getByRole("button", { name: "إنهاء الاختبار" }).click();
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  expect(requests.some((r) => r.path.endsWith("?action=complete"))).toBe(true);
  expect(errors).toEqual([]);
});
for (const width of [360, 430])
  test(`chat composer is visible and usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const { errors } = await setup(page);
    await page.getByRole("button", { name: "المحادثة مع AI" }).click();
    const composer = page.getByLabel("رسالتك للمعلم");
    await expect(composer).toBeVisible();
    const box = await composer.boundingBox();
    expect(box!.y + box!.height).toBeLessThan(800 - 64);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await page.screenshot({
      path: `/tmp/nursing-mobile-chat-${width}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });

test("study preferences are saved and mistake recovery sends the student's answer", async ({
  page,
}) => {
  const { requests, errors } = await setup(page);
  await page.getByRole("button", { name: "حسابي", exact: true }).click();
  await page
    .getByRole("button", { name: "تفضيلات الدراسة وإعدادات التطبيق" })
    .click();
  await page.getByLabel("مستوى التفصيل").selectOption("detailed");
  await page
    .getByRole("button", { name: "حفظ التفضيلات", exact: true })
    .click();
  await expect(
    page.getByText("تم حفظ تفضيلات الدراسة", { exact: true }),
  ).toBeVisible();
  expect(
    JSON.parse(
      requests.find(
        (r) => r.path === "/api/profile/preferences" && r.method === "PUT",
      )!.body,
    ).explanation_depth,
  ).toBe("detailed");
  await page.getByRole("button", { name: "الرئيسية", exact: true }).click();
  await page.getByRole("button", { name: /مراجعة أخطائي/ }).click();
  await page
    .getByLabel("أجب مجددًا لمراجعة هذا الخطأ")
    .selectOption("تقييم المريض");
  await page.getByRole("button", { name: "تأكيد إجابة المراجعة" }).click();
  await expect(
    page.getByText("صحيح؛ تحتاج مراجعة صحيحة لاحقة للوصول إلى الإتقان", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    JSON.parse(
      requests.find(
        (r) => r.path === "/api/learning-progress/mistakes/mistake/review",
      )!.body,
    ),
  ).toEqual({ studentAnswer: "تقييم المريض" });
  expect(errors).toEqual([]);
});

test("theme picker saves mode and accent, follows the device only when selected", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await setup(page);
  // First launch remains light, even on a device set to dark.
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: "تخصيص المظهر", exact: true }).click();
  await page.getByRole("button", { name: "داكن", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(16, 20, 25)",
  );
  await expect(page.locator("header")).toHaveCSS("color", "rgb(241, 245, 249)");
  await page.getByRole("button", { name: "بنفسجي", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "violet");
  await page.getByRole("button", { name: "إغلاق", exact: true }).click();
  await page.screenshot({ path: "/tmp/nursing-theme-dark.png" });
  await page.reload();
  await page.getByRole("button", { name: "تخصيص المظهر", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "داكن", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "بنفسجي", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "فاتح", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: "إغلاق", exact: true }).click();
  await page.screenshot({ path: "/tmp/nursing-theme-light.png" });
  await page.getByRole("button", { name: "تخصيص المظهر", exact: true }).click();
  await page.getByRole("button", { name: "حسب الجهاز", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("appearance is available before login and stays synchronized in settings", async ({
  page,
}) => {
  await setup(page, false);
  await page.getByRole("button", { name: "تخصيص المظهر", exact: true }).click();
  await page.getByRole("button", { name: "داكن", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "إغلاق", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "المتابعة باستخدام Google" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "تخصيص المظهر", exact: true }).click();
  await page.getByRole("button", { name: "فاتح", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

// ------------------------------------------------------------ release hardening

test("bottom sheet takes focus, traps Tab, closes on Escape and returns focus to its trigger", async ({
  page,
}) => {
  await setup(page, false);
  const trigger = page.getByRole("button", { name: "تخصيص المظهر", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const focusInside = () =>
    page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
  await expect.poll(focusInside).toBe(true);
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press(i % 3 === 2 ? "Shift+Tab" : "Tab");
    expect(await focusInside(), `focus escaped the dialog after ${i + 1} presses`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("login fields are labelled and the password toggle has a name and state", async ({
  page,
}) => {
  await setup(page, false);
  await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
  const password = page.getByLabel("كلمة المرور", { exact: true });
  await expect(password).toHaveAttribute("type", "password");
  const toggle = page.getByRole("button", { name: "إظهار كلمة المرور" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  const box = await toggle.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await toggle.click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "إخفاء كلمة المرور" })).toHaveAttribute("aria-pressed", "true");
});

// 180px reproduces a 360px phone at 200% zoom.
for (const width of [360, 390, 430, 180])
  test(`no horizontal overflow or clipped actions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const { errors } = await setup(page, false);
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(1);
    await expect(page.getByRole("button", { name: /تسجيل الدخول|دخول/ }).first()).toBeInViewport();
    await setup(page);
    await page.getByRole("button", { name: "المكتبة", exact: true }).click();
    await page.getByRole("button", { name: "حزمة الدراسة", exact: true }).click();
    await expect(page.getByText("مفهوم الأكسجين", { exact: true })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

test("offline cold start shows the saved shell with a clear notice, or the offline screen without one", async ({
  page,
}) => {
  await setup(page);
  // A normal online start saves the profile snapshot.
  await expect(page.getByRole("button", { name: "المكتبة", exact: true })).toBeVisible();
  await page.unroute("**/api/**");
  await page.route("**/api/**", (route) => route.abort("internetdisconnected"));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
  });
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "أنت غير متصل" })).toBeVisible();
  await expect(page.getByText("قد لا تكون محدثة")).toBeVisible();

  await page.evaluate(() => localStorage.removeItem("CapacitorStorage.nursing_profile_snapshot"));
  await page.reload();
  await expect(page.getByText("لا يوجد اتصال بالإنترنت")).toBeVisible();
});
