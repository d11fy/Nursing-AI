import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-blue-50 via-white to-white dark:from-slate-900 dark:via-slate-950 dark:to-slate-950">
      <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
          <Sparkles className="size-4" />
          مبني خصيصًا لطلاب التمريض
        </div>

        <h1 className="text-balance text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl dark:text-white">
          مساعدك الذكي في دراسة{" "}
          <span className="bg-gradient-to-l from-blue-600 to-teal-500 bg-clip-text text-transparent">
            التمريض
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-slate-600 dark:text-slate-300">
          اسأل، ارفع صورة، وافهم أي موضوع تمريضي بطريقة بسيطة وواضحة.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            size="lg"
            className="w-full sm:w-auto"
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
            className="w-full sm:w-auto"
            nativeButton={false}
            render={<Link href="/register">جرب مجانًا</Link>}
          />
        </div>
      </div>
    </section>
  );
}
