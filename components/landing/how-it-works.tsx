import { BookOpen, BrainCircuit, BookOpenCheck, TrendingUp } from "lucide-react";

const steps = [
  { icon: BookOpen, title: "اختر المادة أو المصدر", desc: "ابدأ من مادة، كتاب، محاضرة، صورة، أو ملف خاص بك." },
  { icon: BrainCircuit, title: "ادرس واسأل AI", desc: "اطلب شرحًا مرتبطًا بسياق دراستك مع توضيح عربي عند الحاجة." },
  { icon: BookOpenCheck, title: "أنشئ Study Pack", desc: "اجمع الملخص والنقاط والبطاقات والاختبار في مساحة واحدة." },
  { icon: TrendingUp, title: "اختبر نفسك وتابع تقدمك", desc: "راجع أخطاءك وموضوعاتك الضعيفة وراقب تحسن الإتقان." },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
      <p className="eyebrow text-center">من المصدر إلى الإتقان</p>
      <h2 className="mt-2 text-center text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">كيف تعمل المنصة؟</h2>
      <p className="mt-3 text-center text-muted-foreground">أربع خطوات واضحة تبقي دراستك منظمة</p>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <div
            key={step.title}
            className="interactive-card relative rounded-2xl border border-border bg-card p-6"
          >
            <div className="icon-tile mb-4">
              <step.icon className="size-5" />
            </div>
            <span className="absolute left-6 top-6 text-sm font-extrabold text-border">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="font-bold text-foreground">{step.title}</h3>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">{step.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
