import Link from "next/link";
import {
  ArrowLeft,
  BookMarked,
  BookOpenCheck,
  BrainCircuit,
  Check,
  CircleAlert,
  Clock3,
  FileImage,
  GraduationCap,
  Languages,
  Library,
  ListChecks,
  LockKeyhole,
  Mail,
  MessageCircleQuestion,
  MessageSquareText,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  Upload,
  WalletCards,
} from "lucide-react";
import type { PublicSiteData } from "@/lib/public-site";
import { Button } from "@/components/ui/button";

const featureCards = [
  [BrainCircuit, "AI Nursing Tutor", "شرح مرتبط بمادتك ومصادرك مع إبقاء المصطلحات الطبية واضحة."],
  [Library, "Study Library", "كتب ومحاضرات وملخصات وامتحانات سابقة مرتبة حسب سنتك ومادتك."],
  [BookOpenCheck, "Study Pack", "حوّل المحاضرة إلى ملخص ونقاط مهمة وبطاقات واختبار ومساحة سؤال."],
  [ListChecks, "Smart Quiz", "اختبارات تدريبية وتصحيح محفوظ يساعدك على معرفة ما يحتاج مراجعة."],
  [BookMarked, "Flashcards", "راجع المفاهيم بخطوات قصيرة وسجّل مستوى تذكرك لكل بطاقة."],
  [FileImage, "Images & Files", "ارفع صورة أو ملفًا خاصًا وادرس المحتوى ضمن حدود باقتك."],
  [CircleAlert, "My Mistakes", "ارجع إلى إجاباتك الخاطئة بدل أن تضيع بين الاختبارات السابقة."],
  [TrendingUp, "Progress Tracking", "راقب الإتقان والموضوعات الضعيفة وتقدمك عبر جلسات الدراسة."],
] as const;

const entitlementLabels: Record<string, string> = {
  ai_questions_daily: "سؤال AI يوميًا",
  images_limit: "صورة",
  files_limit: "ملف",
  study_pack_limit: "حزمة دراسة",
  quiz_limit: "اختبار",
};

function planFeatures(entitlements: Record<string, boolean | number | string | null>) {
  const limits = Object.entries(entitlements)
    .filter(([key, value]) => key in entitlementLabels && typeof value === "number")
    .slice(0, 4)
    .map(([key, value]) => `${value} ${entitlementLabels[key]}`);
  const enabled = [
    ["library_enabled", "المكتبة التعليمية"],
    ["flashcards_enabled", "البطاقات التعليمية"],
    ["progress_enabled", "حفظ التقدم"],
  ].filter(([key]) => entitlements[key] === true).map(([, label]) => label);
  return [...limits, ...enabled].slice(0, 5);
}

export function ProductSections({ data, dashboardHref }: { data: PublicSiteData; dashboardHref: string | null }) {
  const primaryHref = dashboardHref ?? "/register";
  const published = new Date(data.appVersion.published_at).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });

  return (
    <>
      <section id="platform" className="border-y border-border bg-muted/35 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <p className="eyebrow text-center">منصة دراسة متكاملة</p>
          <h2 className="mx-auto mt-3 max-w-3xl text-balance text-center text-3xl font-black tracking-tight sm:text-4xl">الأدوات الأساسية التي يحتاجها طالب التمريض، في مساحة واحدة</h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featureCards.map(([Icon, title, description]) => (
              <article key={title} className="interactive-card rounded-2xl border border-border bg-card p-5">
                <div className="icon-tile mb-4"><Icon className="size-5" /></div>
                <h3 className="font-black text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="eyebrow">طريقة تعليم تحافظ على لغتك الأكاديمية</p>
            <h2 className="mt-3 text-3xl font-black sm:text-4xl">Study in English.<br />Understand in Arabic.<br />Master Nursing Terminology.</h2>
            <p className="mt-5 max-w-xl leading-8 text-muted-foreground">يقدّم الشرح الأكاديمي بالإنجليزية أولًا، ثم يضيف توضيحًا عربيًا عندما يساعد على الفهم، مع إبقاء المصطلحات الطبية الأساسية ظاهرة كما ستقابلها في الكتاب والامتحان.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            {[
              [GraduationCap, "English first", "صياغة أكاديمية واضحة تناسب الدراسة والمراجعة."],
              [Languages, "Arabic clarification", "توضيح موجز عند الحاجة دون استبدال المصطلح العلمي."],
              [MessageSquareText, "Context matters", "الإجابة تعتمد على المادة أو الملف المحدد كلما توفر."],
            ].map(([Icon, title, description]) => (
              <div key={String(title)} className="flex gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="icon-tile shrink-0"><Icon className="size-5" /></div>
                <div><h3 className="font-black">{String(title)}</h3><p className="mt-1 text-sm leading-7 text-muted-foreground">{String(description)}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-primary-foreground/70">Study Pack</p>
            <h2 className="mt-3 text-3xl font-black sm:text-4xl">حوّل محاضرتك إلى مساحة دراسة متكاملة</h2>
            <p className="mt-5 max-w-xl leading-8 text-primary-foreground/80">ابدأ من المصدر نفسه، ثم انتقل بين الدراسة والملخص والنقاط المهمة والبطاقات والاختبار والسؤال دون فقد السياق.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {["Study", "Summary", "Key Points", "Flashcards", "Quiz", "Ask AI"].map((item, index) => (
              <div key={item} className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
                <span className="text-xs font-bold text-white/60">0{index + 1}</span><p className="mt-4 font-black">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2">
          <div className="section-surface p-6 sm:p-8">
            <div className="flex items-center justify-between"><div><p className="eyebrow">المكتبة</p><h2 className="mt-2 text-2xl font-black">مصادرك حسب مسارك الدراسي</h2></div><Library className="size-9 text-primary" /></div>
            <div className="mt-7 grid grid-cols-2 gap-3 text-sm">
              {["Academic Year", "Semester", "Subject", "Books", "Lectures", "Summaries", "Previous Exams", "Favorites"].map((item) => <div key={item} className="rounded-xl border border-border bg-background px-4 py-3 font-bold">{item}</div>)}
            </div>
          </div>
          <div className="section-surface p-6 sm:p-8">
            <div className="flex items-center justify-between"><div><p className="eyebrow">التقدم</p><h2 className="mt-2 text-2xl font-black">اعرف أين تتحسن وما يحتاج مراجعة</h2></div><TrendingUp className="size-9 text-primary" /></div>
            <div className="mt-7 space-y-5">
              {[["Heart Failure", 82], ["Fluid & Electrolytes", 54], ["Vital Signs", 91]].map(([topic, value]) => (
                <div key={String(topic)}><div className="mb-2 flex justify-between text-sm"><b>{topic}</b><span className="font-black tabular-nums">{value}%</span></div><div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} /></div></div>
              ))}
            </div>
            <div className="mt-7 flex flex-wrap gap-2"><span className="rounded-full bg-warning/10 px-3 py-1.5 text-xs font-bold text-warning">My Mistakes</span><span className="rounded-full bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive">Weak Topics</span><span className="rounded-full bg-success/10 px-3 py-1.5 text-xs font-bold text-success">Progress</span></div>
          </div>
        </div>
      </section>

      <section id="pricing" className="border-y border-border bg-muted/40 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <p className="eyebrow">ابدأ قبل الاشتراك</p>
            <h2 className="mt-3 text-3xl font-black sm:text-4xl">تجربة مجانية ثم باقة تناسب دراستك</h2>
            <p className="mt-4 leading-8 text-muted-foreground">القيم أدناه تأتي مباشرة من إعدادات المنصة الحالية، وتتغير تلقائيًا عندما تعدّلها الإدارة.</p>
          </div>
          <div className="mx-auto mt-10 grid max-w-5xl gap-3 rounded-2xl border border-primary/20 bg-accent p-5 sm:grid-cols-5">
            {[
              [Clock3, `${data.trial.durationDays} أيام`, "مدة التجربة"],
              [BrainCircuit, `${data.trial.aiQuestionsDaily}`, "سؤال AI يوميًا"],
              [FileImage, `${data.trial.imagesTotal}`, "صور"],
              [Upload, `${data.trial.filesTotal}`, "ملفات"],
              [BookOpenCheck, `${data.trial.studyPacksTotal}`, "Study Pack"],
            ].map(([Icon, value, label]) => <div key={String(label)} className="rounded-xl bg-card p-4 text-center"><Icon className="mx-auto size-5 text-primary" /><b className="mt-2 block text-lg">{String(value)}</b><span className="text-xs text-muted-foreground">{String(label)}</span></div>)}
          </div>
          {data.plans.length ? (
            <div className="mt-10 grid gap-5 lg:grid-cols-3">
              {data.plans.map((plan) => (
                <article key={plan.id} className={`relative flex flex-col rounded-3xl border bg-card p-6 ${plan.recommended ? "border-primary shadow-[0_18px_50px_rgb(15_93_117/0.12)]" : "border-border"}`}>
                  {plan.recommended && <span className="absolute -top-3 right-6 rounded-full bg-primary px-3 py-1 text-xs font-black text-primary-foreground">موصى بها</span>}
                  <h3 className="text-xl font-black">{plan.name}</h3><p className="mt-2 min-h-14 text-sm leading-7 text-muted-foreground">{plan.description}</p>
                  <p className="mt-5 text-4xl font-black tabular-nums">{plan.price} <span className="text-sm text-muted-foreground">{plan.currency}</span></p><p className="mt-1 text-xs text-muted-foreground">لمدة {plan.durationDays} يومًا</p>
                  <div className="my-6 h-px bg-border" />
                  <ul className="flex-1 space-y-3 text-sm">{planFeatures(plan.entitlements).map((feature) => <li key={feature} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" />{feature}</li>)}</ul>
                  <Button className="mt-7 w-full" variant={plan.recommended ? "default" : "outline"} nativeButton={false} render={<Link href={primaryHref}>{dashboardHref ? "فتح الاشتراك" : "ابدأ بهذه الباقة"}</Link>} />
                </article>
              ))}
            </div>
          ) : <p className="mx-auto mt-8 max-w-xl rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">تعذر تحميل الباقات الآن. يمكنك إنشاء حساب والعودة إلى صفحة الاشتراك عند استعادة الاتصال.</p>}
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
          <div><p className="eyebrow">دفع يدوي واضح</p><h2 className="mt-3 text-3xl font-black">من اختيار الباقة إلى التفعيل بخطوات مفهومة</h2><p className="mt-4 leading-8 text-muted-foreground">بيانات الحساب أو المحفظة لا تظهر هنا؛ يراها المستخدم داخل مسار الدفع الآمن بعد تسجيل الدخول.</p></div>
          <ol className="space-y-3">
            {["اختر الباقة المناسبة", "اختر طريقة الدفع المتاحة", "حوّل المبلغ وارفع إشعار الدفع", "تراجع الإدارة الطلب", "يتفعّل الاشتراك بعد الموافقة"].map((step, index) => <li key={step} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-black text-primary-foreground">{index + 1}</span><span className="font-bold">{step}</span></li>)}
          </ol>
        </div>
      </section>

      <section className="border-y border-border bg-[#083344] py-20 text-white sm:py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_.85fr]">
          <div><div className="inline-flex size-14 items-center justify-center rounded-2xl bg-white/10"><Smartphone className="size-7" /></div><p className="mt-5 text-xs font-black uppercase tracking-widest text-cyan-200">Android Release</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">حمّل Nursing AI للأندرويد</h2><p className="mt-4 max-w-xl leading-8 text-slate-300">واجهة محلية داخل APK وليست موقعًا داخل WebView، وتتصل بنفس حسابك واشتراكك وبيانات تعلمك عبر Backend الآمن.</p><Button className="mt-7 bg-white text-[#083344] hover:bg-slate-100" nativeButton={false} render={<Link href="/download">فتح صفحة التحميل<ArrowLeft className="size-4" /></Link>} /></div>
          <div className="rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur-sm"><div className="flex items-center justify-between gap-4"><div><p className="text-xs text-slate-300">الإصدار الحالي</p><p className="mt-1 text-2xl font-black">v{data.appVersion.latest_version}</p></div><Smartphone className="size-10 text-cyan-200" /></div><div className="my-5 h-px bg-white/15" /><dl className="grid grid-cols-2 gap-4 text-sm"><div><dt className="text-slate-400">الحجم</dt><dd className="mt-1 font-bold">{data.appVersion.file_size ?? "—"}</dd></div><div><dt className="text-slate-400">آخر تحديث</dt><dd className="mt-1 font-bold">{published}</dd></div></dl></div>
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6"><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {[[LockKeyhole, "بيانات الطالب خاصة"], [FileImage, "ملفات خاصة"], [ShieldCheck, "حساب آمن"], [TrendingUp, "تقدم محفوظ"], [WalletCards, "مراجعة دفع يدوية"]].map(([Icon, label]) => <div key={String(label)} className="rounded-2xl border border-border bg-card p-5 text-center"><Icon className="mx-auto size-6 text-primary" /><p className="mt-3 text-sm font-black">{String(label)}</p></div>)}
        </div></div>
      </section>

      <section id="faq" className="border-y border-border bg-muted/35 py-20 sm:py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6"><p className="eyebrow text-center">أسئلة شائعة</p><h2 className="mt-3 text-center text-3xl font-black">قبل أن تبدأ</h2><div className="mt-10 space-y-3">
          {[
            ["ما هي Nursing AI ولمن؟", "منصة دراسة للطلاب في تخصص التمريض تجمع المساعد الذكي والمصادر وحزم الدراسة والاختبارات والتقدم."],
            ["هل تدعم العربية؟", "نعم. تحافظ على الشرح والمصطلحات الأكاديمية بالإنجليزية وتضيف توضيحًا عربيًا عندما يفيد."],
            ["هل أستطيع رفع ملفات وصور؟", "نعم، ضمن الأنواع والحجم وحدود الباقة المطبقة على حسابك."],
            ["ما هي Study Pack؟", "مساحة مشتقة من محاضرة أو مصدر وتجمع Study وSummary وKey Points وFlashcards وQuiz وAsk AI."],
            ["كيف تعمل التجربة والدفع؟", `التجربة الحالية مدتها ${data.trial.durationDays} أيام. بعد ذلك تختار باقة وطريقة دفع وترفع الإيصال للمراجعة.`],
            ["متى يتفعل الاشتراك؟", "بعد أن تراجع الإدارة إثبات الدفع وتوافق عليه. تظهر حالة الطلب داخل حسابك."],
            ["هل تضيع بياناتي عند انتهاء الاشتراك؟", "لا تُحذف بيانات الدراسة لمجرد انتهاء الاشتراك؛ يتوقف الوصول إلى الميزات المقيدة حتى التجديد."],
            ["هل الحساب يعمل على أكثر من جهاز؟", "حساب الطالب مخصص لجهاز فعال واحد لحماية الاشتراك. يمكن للإدارة إعادة ربط الجهاز عند الحاجة."],
            ["كيف أحمل التطبيق وأحدّثه؟", "حمّل APK الموقّع من صفحة التنزيل. يفحص التطبيق إعداد الإصدار من الخادم عند الفتح وينبهك عند توفر تحديث."],
          ].map(([question, answer]) => <details key={question} className="group rounded-2xl border border-border bg-card p-5"><summary className="cursor-pointer list-none font-black marker:hidden">{question}</summary><p className="mt-3 text-sm leading-7 text-muted-foreground">{answer}</p></details>)}
        </div></div>
      </section>

      <section id="contact" className="py-16"><div className="mx-auto max-w-4xl px-4 text-center sm:px-6"><MessageCircleQuestion className="mx-auto size-8 text-primary" /><h2 className="mt-3 text-2xl font-black">تحتاج مساعدة؟</h2>{data.contact.email || data.contact.whatsapp ? <div className="mt-5 flex flex-wrap justify-center gap-3">{data.contact.email && <Button variant="outline" nativeButton={false} render={<a href={`mailto:${data.contact.email}`}><Mail className="size-4" />{data.contact.email}</a>} />}{data.contact.whatsapp && <Button variant="outline" nativeButton={false} render={<a href={`https://wa.me/${data.contact.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><MessageSquareText className="size-4" />WhatsApp</a>} />}</div> : <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-muted-foreground">تظهر قنوات البريد وWhatsApp هنا فور نشرها من إعدادات الإدارة. يمكن للمستخدم المسجل متابعة طلبات الاشتراك من حسابه.</p>}</div></section>
    </>
  );
}
