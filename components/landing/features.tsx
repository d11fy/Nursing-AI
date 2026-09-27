import {
  BookOpenText,
  ScanSearch,
  Languages,
  ListChecks,
  Database,
  History,
} from "lucide-react";

const features = [
  { icon: BookOpenText, title: "شرح المواد", desc: "شرح مبسط ومنظم لكل موضوعات التمريض." },
  { icon: ScanSearch, title: "تحليل الصور", desc: "ارفع صورة من كتاب أو محاضرة واسأل عنها مباشرة." },
  { icon: Languages, title: "تبسيط المصطلحات", desc: "شرح بالعربية مع الحفاظ على المصطلح الطبي بالإنجليزية." },
  { icon: ListChecks, title: "أسئلة مراجعة", desc: "نقاط مهمة ومراجعة سريعة قبل الامتحان." },
  { icon: Database, title: "قاعدة معرفة تمريضية", desc: "إجابات مبنية على مصادر تعليمية موثوقة." },
  { icon: History, title: "حفظ المحادثات", desc: "ارجع لأي محادثة سابقة في أي وقت." },
];

export function Features() {
  return (
    <section id="features" className="bg-slate-50 py-20 dark:bg-slate-900/40">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-center text-3xl font-bold text-slate-900 dark:text-white">كل ما تحتاجه لتفهم أكثر</h2>
        <p className="mt-3 text-center text-slate-500">مصمم ليكون رفيقك في كل مرحلة من دراستك</p>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:shadow-md"
            >
              <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-300">
                <f.icon className="size-5" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
