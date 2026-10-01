import Link from "next/link";
import { ArrowLeft, CheckCircle2, MessageSquareText, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="landing-grid relative overflow-hidden border-b border-border bg-background">
      <div className="absolute inset-0 bg-background/88" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_.95fr] lg:py-24">
        <div className="text-center lg:text-start">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-card px-4 py-1.5 text-sm font-bold text-primary shadow-sm">
          <ShieldCheck className="size-4" />
          مبني خصيصًا لطلاب التمريض
        </div>

        <h1 className="text-balance text-[clamp(2.35rem,5.4vw,4.15rem)] font-black leading-[1.25] tracking-[-0.045em] text-foreground">
          افهم التمريض بوضوح،<br className="hidden sm:block" /> وادرس بثقة أكبر
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-8 text-muted-foreground sm:text-lg lg:mx-0">
          مساعد دراسي ذكي يربط أسئلتك بموادك ومحاضراتك، ويقدّم شرحًا عربيًا منظمًا مع الحفاظ على المصطلحات الطبية.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground lg:justify-start">
          <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-success" /> شرح واضح</span>
          <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-success" /> رفع صور وملفات</span>
          <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-success" /> مصادر تعليمية</span>
        </div>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
          <Button
            size="lg"
            className="w-full px-6 sm:w-auto"
            nativeButton={false}
            render={
              <Link href="/register">
                ابدأ الدراسة
                <ArrowLeft className="size-4" />
              </Link>
            }
          />
          <Button
            size="lg"
            variant="outline"
            className="w-full bg-card px-6 sm:w-auto"
            nativeButton={false}
            render={<Link href="/register">جرب مجانًا</Link>}
          />
        </div>
        </div>

        <div className="relative mx-auto w-full max-w-lg" aria-label="مثال على تجربة الدراسة">
          <div className="section-surface overflow-hidden shadow-[0_24px_70px_rgb(16_42_58/0.12)]">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <p className="text-sm font-bold text-foreground">جلسة دراسة ذكية</p>
                <p className="mt-0.5 text-xs text-muted-foreground">تمريض الباطني والجراحي</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-bold text-success">
                <span className="size-1.5 rounded-full bg-success" /> جاهز للدراسة
              </span>
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              <div className="mr-auto max-w-[88%] rounded-2xl rounded-ee-md bg-primary px-4 py-3 text-sm leading-7 text-primary-foreground">
                اشرح لي خطوات تقييم مريض Heart Failure قبل إعطاء الدواء.
              </div>
              <div className="rounded-2xl border border-border bg-background p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold text-primary">
                  <MessageSquareText className="size-4" /> شرح Nursing AI
                </div>
                <p className="text-sm font-semibold leading-7 text-foreground">ابدأ بتقييم ABC والحالة العامة، ثم راجع العلامات الحيوية وحالة السوائل.</p>
                <div className="mt-3 space-y-2 text-xs leading-6 text-muted-foreground">
                  <p className="flex gap-2"><CheckCircle2 className="mt-1 size-3.5 shrink-0 text-success" /> قياس ضغط الدم والنبض وSpO₂.</p>
                  <p className="flex gap-2"><CheckCircle2 className="mt-1 size-3.5 shrink-0 text-success" /> تقييم الوذمة وأصوات الرئتين والوزن.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-accent px-3.5 py-3 text-xs font-semibold text-accent-foreground">
                <Search className="size-4" /> الإجابة مرتبطة بسياق المادة والمحاضرة.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
