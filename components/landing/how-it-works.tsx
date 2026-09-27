import { MessageCircleQuestion, ImageUp, Search, Lightbulb } from "lucide-react";

const steps = [
  { icon: MessageCircleQuestion, title: "اسأل سؤالك", desc: "اكتب أي سؤال متعلق بالتمريض بكل بساطة." },
  { icon: ImageUp, title: "ارفع صورة إذا احتجت", desc: "من كتاب، محاضرة، PowerPoint، أو ملاحظاتك." },
  { icon: Search, title: "Nursing AI يبحث في المصادر", desc: "يبحث داخل قاعدة المعرفة التمريضية الخاصة بنا أولًا." },
  { icon: Lightbulb, title: "تحصل على شرح واضح", desc: "إجابة منظمة وسهلة الفهم مع نقاط مهمة للامتحان." },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <h2 className="text-center text-3xl font-bold text-slate-900 dark:text-white">كيف تعمل المنصة؟</h2>
      <p className="mt-3 text-center text-slate-500">أربع خطوات بسيطة نحو فهم أعمق</p>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <div
            key={step.title}
            className="relative rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:shadow-md"
          >
            <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
              <step.icon className="size-5" />
            </div>
            <span className="absolute left-6 top-6 text-sm font-bold text-slate-300 dark:text-slate-700">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="font-semibold text-slate-900 dark:text-white">{step.title}</h3>
            <p className="mt-2 text-sm text-slate-500">{step.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
