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
    <section id="features" className="border-y border-border bg-muted/45 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="eyebrow text-center">مصمم للدراسة اليومية</p>
        <h2 className="mt-2 text-center text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">كل ما تحتاجه لتفهم أكثر</h2>
        <p className="mx-auto mt-3 max-w-xl text-center leading-7 text-muted-foreground">أدوات واضحة تساعدك على الانتقال من السؤال إلى الفهم والمراجعة داخل مساحة واحدة.</p>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="interactive-card rounded-2xl border border-border bg-card p-6"
            >
              <div className="icon-tile mb-4">
                <f.icon className="size-5" />
              </div>
              <h3 className="font-bold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
