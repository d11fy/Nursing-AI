# دراسة الكتب بالفصول + موثوقية البث وحفظ الإجابة

تاريخ التنفيذ: 2026-10-09 — الفرع `codex/release-hardening`.

## المشكلة (الأسباب الجذرية)

1. **"الملف لا يُقرأ بشكل كامل"**: بعد معالجة الملف كان `attachProcessedLecture` يخزّن أول 30 صفحة فقط (حتى 10 آلاف حرف لكل صفحة) في سجل المرفق، و`attachmentEvidence` كان يحقن **أول 3 صفحات** كدليل أساسي في كل سؤال. النتيجة: الإجابة تميل لبداية الملف حتى لو كان الفهرس الكامل في `knowledge_chunks` سليمًا.
2. **"Chapter 4 يخلط الفصول"**: لا توجد بنية للكتاب. المقاطع كانت تُقسَّم لكل صفحة فقط، وعمود `chapter` يحمل أحيانًا أي سطر يبدأ بـ "Chapter". الاسترجاع كان semantic عامًا (أعلى 5–10 مقاطع) بلا أي فلتر فصل، ولا يوجد "موضع" يحفظه النظام ليفهم "كمل".
3. **"انقطع الاتصال قبل حفظ الإجابة"**: توليد الإجابة وحفظها كانا داخل `ReadableStream.start()` ومربوطين بـ `request.signal`. أي انقطاع للشبكة أو دخول التطبيق للخلفية = `cancel()` = إلغاء مزود الذكاء الاصطناعي = **لا تُحفظ الإجابة**. وعند فشل داخلي كان نص الخطأ يُلحق بنص الإجابة ثم يظهر الخطأ الثاني في الواجهة.
4. **لا تعريف لحالة التوليد**: لا `request_id`، فكل "إعادة محاولة" تولّد إجابة جديدة وتستهلك سؤالًا جديدًا.

## ما تغيّر

### المسار: رفع ← استخراج ← بنية ← تقطيع ← فهرسة ← RAG ← محادثة ← بث ← حفظ

| الطبقة | الملف | التغيير |
|---|---|---|
| حالات الملف | `lib/chat/file-status.ts`, `app/api/chat/files/route.ts` | حالات موحّدة للطالب: uploading / processing / ready / failed مع رسالة عربية وزر إعادة محاولة. لا استخدام للملف مع الذكاء قبل `ready` (الخادم يرفض بـ 409 + `code`). |
| الاستخراج | `lib/document-text.ts`, `lib/knowledge.ts` | عناوين DOCX بمستوياتها (`#`/`##`) من `styles.xml` (Heading N، عنوان N، outlineLvl)، التاب/السطر الجديد يفصل الكلمات، شرائح PPTX بترتيب العرض الفعلي وملاحظات كل شريحة عبر علاقاتها، ملفات TXT بترميز UTF-8/UTF-16/Windows-1256. |
| بنية الكتاب | `lib/tutor/structure.ts`, `numbering.ts` | اكتشاف `Chapter 4 / CHAPTER 4 / Chapter Four / Ch. 4 / Chapter IV / الفصل الرابع / Unit 4`، العنوان على أسطر منفصلة، الفهرس (TOC) كإشارة قوية مع التحقق من ظهور العنوان فعليًا ودون الاعتماد على أرقام الصفحات، تجاهل العناوين المتكررة في رأس الصفحة والإشارات المرجعية وقوائم الفصول بلا نص، الترتيب بالظهور عند غياب الترقيم (ثقة medium)، وعدم التخمين عند الثقة المنخفضة. |
| المقاطع | `lib/tutor/document-index.ts` | كل مقطع يحمل `chapter_index, chapter_number, chapter_title, section_title, subsection_title, page_number, slide_number`. التقطيع يحترم حدود الفصل (يُقسّم حتى لو بدأ الفصل منتصف صفحة). |
| الـ Outline | `knowledge_documents.outline_json` | الكتاب ← الفصول ← الأقسام مع الثقة والتحذيرات وما ورد في الفهرس ولم يُعثر عليه. |
| محلل النية | `lib/tutor/chapter-intent.ts` | "Chapter 4 / chapter four / شابتر 4 / الفصل الرابع / رابع شابتر"، كمل، اللي بعده، ارجع شوي، الجزء الثاني، اختبرني فيه، روح للشابتر التالي/السابق، ما هي الفصول؟، لخص الملف. حتمي بلا استدعاء نموذج. |
| الخطة | `lib/tutor/study-plan.ts`, `study-flow.ts` | الفصل يُقسَّم لأجزاء مرتبة (≤ 10 مقاطع مدمجة لكل جزء). الفصل محدّد قبل أي بحث: `document → chapter → parts`. الاسترجاع الدلالي (للأسئلة المحددة) يعمل **داخل الفصل فقط** عبر فلتر `chapter_index` في كل فروع `RETRIEVAL_SQL`. |
| السياق | `conversation_summaries` (أعمدة جديدة) | `current_document_id, current_chapter_index/number/title, current_section_title, current_part, total_parts, current_position`. تُحفظ على الخادم لحظة حفظ الإجابة وتُمسح عند تغيير الكتاب. |
| التوليد | `lib/tutor/chat.ts`, `generations.ts` | جدول `chat_generations` (pending ← streaming ← completed/failed/cancelled) + `messages.generation_id` فريد. التوليد **مفصول عن الاتصال**: انقطاع الهاتف لا يلغيه ولا يمنع حفظ الإجابة. الحفظ + إكمال التوليد في معاملة واحدة. |
| البث | `lib/chat/stream.ts`, `turn.ts`, `recovery.ts` | أحداث `started / delta / persisted / error` + keep-alive كل 10 ثوانٍ، كاشف توقف (35 ثانية بلا بايتات) وإعادة اتصال ذكية. |
| الاستعادة | `app/api/chat/generations/[requestId]` | GET: أين إجابتي؟ (completed ← الرسالة، failed ← إعادة، not_found ← أرسل ثانيةً بأمان)، DELETE: زر الإيقاف فقط. |
| عدم التكرار | `reserveUsage` بمفتاح `chat:<requestId>` | نفس `requestId` لا يستهلك سؤالًا ثانيًا ولا يولّد إجابة ثانية: completed ← إعادة عرض، running ← انتظار، failed ← إعادة تشغيل بدون رسوم. |
| الاستئناف | `GET /api/conversations/:id` و`/study` | الكتاب النشط، الفصل/الجزء الحالي، قائمة الفصول، وآخر سؤال بلا إجابة. |
| الواجهات | `ChatScreen.tsx` (Android)، `chat-view.tsx`/`composer.tsx` (ويب) | أزرار "الفصول"، شريحة الكتاب/الفصل، إعادة المحاولة، إعادة مزامنة عند العودة من الخلفية/فتح القفل/تغيّر الشبكة. |

### كتب موجودة مسبقًا
- **تلقائيًا**: أول طلب فصل على كتاب قديم يعيد بناء بنيته (`ensureDocumentStructure`).
- **يدويًا**: زر "إعادة بناء الفصول" في إدارة المستندات، أو `npm run knowledge:restructure` (خطة بدون تنفيذ افتراضيًا؛ `-- --run [--include-private] [--document <id>] [--force]`).
- إن كانت نصوص المقاطع لم تتغيّر يُحدَّث الـ metadata فقط (بدون Embeddings). وإلا تُستبدل المقاطع ذرّيًا مع إعادة استخدام كل vector نصه لم يتغيّر. المستند يبقى `ready` طوال العملية ولا يُنشأ نسخة مكررة.

### متغيرات تشغيل جديدة
- `CHAT_GENERATION_TIMEOUT_MS` (افتراضي 240000): حد زمن الإجابة الواحدة.

## الأخطاء الداخلية ← رسائل الطالب
`FILE_PROCESSING`, `FILE_PROCESSING_FAILED`, `NO_TEXT_EXTRACTED`, `CHAPTER_NOT_FOUND`, `STRUCTURE_UNCERTAIN`, `RAG_NO_MATCH`, `AI_TIMEOUT`, `STREAM_INTERRUPTED`, `NETWORK_OFFLINE` (+ `GENERATION_IN_PROGRESS`, `GENERATION_NOT_FOUND`, `INTERNAL`) في `lib/chat/errors.ts`.

## السجلات (بلا محتوى حساس)
`STRUCTURE_BUILT/REBUILT` (documentId, chapterCount, sectionCount, chunkCount, confidence)، `CHAPTER_RESOLVED`، `CHAPTER_NOT_FOUND`، `RETRIEVAL_COMPLETED` (chapter, chunkIds)، `GENERATION_STARTED/COMPLETED/FAILED/CANCELLED/REPLAYED`، `STREAM_STARTED/ENDED/CLIENT_LEFT`، `MESSAGE_SAVED`، `STUDY_CONTEXT_SAVED`.

## مستويات التحقق (بصراحة)
- **مُتحقَّق آليًا**: كل ما في `tests/` — اكتشاف البنية، المحلل، التقسيم لأجزاء، الإدخال والاسترجاع على pgvector حقيقي (PGlite)، السيناريو الكامل لفصل 4 ← كمل ← الخامس ← التالي ← السابق ← فصل غير موجود، انقطاع البث وإعادة الطلب بنفس `requestId`، الاستعادة بعد الفشل، RLS، ومسارات HTTP.
- **غير مُتحقَّق هنا**: تشغيل على جهاز أندرويد حقيقي (Wi-Fi ↔ بيانات، قفل الشاشة، إغلاق التطبيق)، بيئة staging، كتب PDF حقيقية بصيغ ناشرين مختلفة، OpenAI الحقيقي (الاختبارات تستخدم نموذجًا مبرمجًا)، مسار LibreOffice لعروض PPTX المصورة.

## حدود معروفة
- كشف الفصول يعتمد على النص المستخرج؛ كتب ممسوحة ضوئيًا تُقرأ بالـ OCR ثم تُكتشف فصولها بنفس الطريقة، لكن جودة العناوين تتبع جودة OCR.
- كتاب بعناوين فصول بلا كلمة Chapter ولا ترقيم ولا أنماط عناوين Word (نص عادي فقط) ← لا فصول مكتشفة، ويُعرض للطالب خيار الصفحات/الموضوع.
- عروض PPTX التي تحتوي صورًا/رسومًا ما زالت تحتاج LibreOffice أو PDF مصدَّر (قرار سابق: لا فهرس ناقص)؛ تحسّنت رسالة الفشل ومسار إعادة المحاولة فقط.
- زر الإيقاف يلغي التوليد على نفس نسخة الخادم فقط (سجل التوليد في الذاكرة)؛ في نشر متعدد النسخ قد لا يصل الإلغاء. الانقطاع العادي لا يلغي أبدًا.
- إعادة تشغيل الخادم أثناء توليد تفقد تلك الإجابة. يبقى سجلها "جارٍ" حتى تمر 4 دقائق على آخر نبضة (نبضة كل 30 ثانية)، ثم تُعرض كفشل قابل لإعادة المحاولة بنفس `requestId` وبدون خصم سؤال جديد.
