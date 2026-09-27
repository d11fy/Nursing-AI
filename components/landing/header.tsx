import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-white/80 backdrop-blur dark:bg-slate-950/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
          <span className="flex size-9 items-center justify-center rounded-xl bg-blue-600 text-white">
            <GraduationCap className="size-5" />
          </span>
          Nursing AI
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 sm:flex dark:text-slate-300">
          <a href="#how-it-works" className="hover:text-blue-600">كيف تعمل المنصة</a>
          <a href="#features" className="hover:text-blue-600">المزايا</a>
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" nativeButton={false} render={<Link href="/login">تسجيل الدخول</Link>} />
          <Button nativeButton={false} render={<Link href="/register">ابدأ الدراسة</Link>} />
        </div>
      </div>
    </header>
  );
}
