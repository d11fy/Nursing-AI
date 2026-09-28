# Nursing AI — PostgreSQL & OpenAI

منصة تعليمية لطلاب التمريض: حسابات، محادثات ذكاء اصطناعي، صور، ملفات، وقاعدة معرفة RAG مدعومة بالكامل عبر OpenAI.

## النشر على Dokploy

1. أنشئ **Database → PostgreSQL** باسم خدمة مثل `nursing-ai-db` واسم قاعدة `nursing_ai`. صورة `postgres:18` العادية تعمل؛ لا تحتاج Supabase أو pgvector. شغّل قاعدة البيانات واحتفظ بكلمة المرور.
2. في خدمة التطبيق اربط مستودع `d11fy/Nursing-AI`، فرع `main`، والمسار `/`. اختر **Nixpacks**؛ ملف `nixpacks.toml` يضبط Node.js 22 وأوامر البناء والتشغيل.
3. في **Environment** أضف المتغيرات التالية واحفظها:

| المتغير | القيمة |
| --- | --- |
| DATABASE_URL | رابط الاتصال **الداخلي** من خدمة PostgreSQL |
| APP_URL | رابط الموقع الكامل باستخدام HTTPS |
| AUTH_SECRET | قيمة عشوائية سرية بطول 32 حرفًا على الأقل |
| AI_PROVIDER | `openai` |
| OPENAI_API_KEY | مفتاح الـ API الخاص بـ OpenAI |
| OPENAI_CHAT_MODEL | `gpt-5.4-mini` |
| OPENAI_VISION_MODEL | `gpt-5.4-mini` |
| OPENAI_EMBEDDING_MODEL | `text-embedding-3-small` |

ولّد AUTH_SECRET على جهازك بهذا الأمر؛ لا تنشر القيمة في GitHub:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

4. أضف دومين في **Domains** واجعله يوجّه إلى منفذ التطبيق `3000`، وفعّل HTTPS. لازم يطابق الرابط قيمة APP_URL؛ جلسات الدخول تستخدم cookies آمنة تتطلب HTTPS في الإنتاج.
5. انشر التطبيق. أمر البناء `npm run build`، وأمر التشغيل `npm run start`. أمر التشغيل الخاص بالمشروع يتحقق من الإعدادات وينشئ ويرقّي الجداول تلقائياً قبل تشغيل الموقع.
6. افتح `/register` وأنشئ حسابًا. لترقيته إلى مدير نفّذ من طرفية **حاوية التطبيق**:

```bash
npm run admin:promote -- your-email@example.com
```

## مزود الذكاء الاصطناعي (OpenAI)

- **نموذج المحادثة والرؤية الأساسي:** `gpt-5.4-mini` للمحادثات، قراءة الصور الطبية، والملفات.
- **نموذج التضمين (Embeddings):** `text-embedding-3-small` لبناء قاعدة المعرفة والبحث الدلالي (RAG).
- يتم تقسيم الملفات الكبيرة إلى Chunks وتخزين التضمينات في PostgreSQL مع البحث عن أقرب المقاطع فقط عبر cosine similarity دون إرسال الكتب الضخمة كاملة إلى الـ API، ما يوفر التكلفة وسرعة الاستجابة بشكل ملحوظ.

### إعادة فهرسة المعرفة (Reindexing)

لإعادة فهرسة المستندات باستخدام تضمينات OpenAI:

```bash
npm run knowledge:reindex
```

## استعادة كلمة المرور

أضف SMTP_HOST وSMTP_PORT وSMTP_USER وSMTP_PASSWORD وSMTP_FROM في Environment لتفعيل رسائل الاستعادة.
# Local Ollama Setup

لتشغيل المساعد محليًا بدون OpenAI، ثبّت Ollama ثم نزّل النماذج:

```bash
ollama pull qwen2.5:3b
ollama pull nomic-embed-text
```

أضف إلى ملف البيئة:

```ini
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_CHAT_MODEL=qwen2.5:3b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

شغّل Ollama (`ollama serve`) ثم طبّق migrations وشغّل المشروع:

```bash
npm run db:migrate
npm run dev
```

يستخدم النظام Ollama للمحادثة والـembeddings، وتبقى OpenAI متاحة بإرجاع `AI_PROVIDER=openai`.
