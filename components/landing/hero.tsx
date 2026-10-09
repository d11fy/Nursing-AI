import Link from "next/link";
import { ArrowLeft, BookOpenCheck, BrainCircuit, CheckCircle2, MessageSquareText, Smartphone, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero({ dashboardHref }: { dashboardHref: string | null }) {
  const primaryHref = dashboardHref ?? "/register";

  return (
    <section className="landing-grid relative overflow-hidden border-b border-border bg-background">
      <div className="absolute inset-0 bg-background/90" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[.92fr_1.08fr] lg:py-24">
        <div className="text-center lg:text-start">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-card px-4 py-1.5 text-sm font-bold text-primary shadow-sm">
            <BrainCircuit className="size-4" />
            منصة دراسة ذكية مصممة لطلاب التمريض
          </div>
          <h1 className="text-balance text-[clamp(2.4rem,5.3vw,4.5rem)] font-black leading-[1.2] tracking-[-0.045em] text-foreground">
            رفيقك الذكي<br />لدراسة التمريض
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-8 text-muted-foreground sm:text-lg lg:mx-0">
            ادرس من محاضراتك وكتبك، افهم المحتوى بالإنجليزية مع دعم عربي، اختبر نفسك، وتابع نقاط ضعفك من مكان واحد.
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground lg:mx-0">
            يربط Nursing AI الشرح بمادتك ومصادرك التعليمية بدل تقديم إجابة عامة بلا سياق.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
            <Button size="lg" className="w-full px-7 sm:w-auto" nativeButton={false} render={
              <Link href={primaryHref}>{dashboardHref ? "الذهاب إلى لوحة التحكم" : "ابدأ تجربتك المجانية"}<ArrowLeft className="size-4" /></Link>
            } />
            <Button size="lg" variant="outline" className="w-full bg-card px-7 sm:w-auto" nativeButton={false} render={<a href="#platform">استكشف المنصة</a>} />
          </div>
          <div className="mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground lg:justify-start">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-success" /> تجربة مجانية قبل الاشتراك</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-success" /> بيانات وملفات خاصة</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-success" /> Web وAndroid</span>
          </div>
        </div>

        <div className="relative mx-auto mb-8 w-full max-w-2xl" aria-label="معاينة توضيحية لواجهات Nursing AI على الويب والأندرويد">
          <div className="overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-[0_32px_90px_rgb(8_51_68/0.16)]">
            <div className="flex items-center justify-between border-b border-border bg-muted/50 px-5 py-3">
              <div className="flex gap-1.5" aria-hidden="true"><span className="size-2.5 rounded-full bg-border" /><span className="size-2.5 rounded-full bg-border" /><span className="size-2.5 rounded-full bg-primary/50" /></div>
              <span className="text-[11px] font-bold text-muted-foreground">Nursing AI · Study Workspace</span>
            </div>
            <div className="grid min-h-[25rem] sm:grid-cols-[10rem_1fr]">
              <div className="hidden border-l border-border bg-muted/35 p-4 sm:block">
                <p className="mb-4 text-xs font-black text-primary">Heart Failure</p>
                {["Study", "Summary", "Key Points", "Flashcards", "Quiz", "Ask AI"].map((item, index) => (
                  <div key={item} className={`mb-2 rounded-lg px-3 py-2 text-[11px] font-semibold ${index === 0 ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{item}</div>
                ))}
              </div>
              <div className="space-y-4 p-5 sm:p-7">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-xs font-bold text-primary">Medical-Surgical Nursing</p><h2 className="mt-1 text-lg font-black">Heart Failure Study Pack</h2></div>
                  <BookOpenCheck className="size-8 text-primary" />
                </div>
                <div className="rounded-2xl border border-border bg-background p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold text-primary"><MessageSquareText className="size-4" /> AI Nursing Tutor</div>
                  <p className="text-sm font-bold leading-7">Heart failure occurs when the heart cannot pump enough blood to meet the body&apos;s needs.</p>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">يعني أن كفاءة ضخ القلب لا تكفي لتلبية احتياجات الأنسجة، مع بقاء المصطلحات الطبية الأساسية بالإنجليزية.</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {["12 Flashcards", "8 Key Points", "Quiz 82%"].map((item) => <div key={item} className="rounded-xl bg-accent p-3 text-center text-[11px] font-bold text-accent-foreground">{item}</div>)}
                </div>
              </div>
            </div>
          </div>

          <div className="absolute -bottom-8 -left-1 w-36 overflow-hidden rounded-[1.75rem] border-[5px] border-foreground/90 bg-card shadow-2xl sm:-left-8 sm:w-44">
            <div className="flex h-8 items-center justify-center bg-primary text-[9px] font-bold text-primary-foreground"><Smartphone className="ms-1 size-3" /> Nursing AI</div>
            <div className="space-y-2 p-3">
              <div className="rounded-xl bg-primary p-3 text-primary-foreground"><p className="text-[9px] opacity-80">تقدمك اليوم</p><p className="mt-1 text-lg font-black">82%</p></div>
              <div className="rounded-xl border border-border p-2"><p className="text-[9px] font-bold">Weak Topics</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full w-[54%] bg-warning" /></div></div>
              <div className="flex items-center gap-1 rounded-xl bg-accent p-2 text-[9px] font-bold text-accent-foreground"><TrendingUp className="size-3" /> تابع الدراسة</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
