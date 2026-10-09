import Link from "next/link";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/brand-mark";

export function LandingHeader({ dashboardHref }: { dashboardHref: string | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-card/90 backdrop-blur-lg">
      <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <BrandMark compact className="sm:hidden" />
          <BrandMark className="hidden sm:inline-flex" />
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-semibold text-muted-foreground md:flex" aria-label="روابط الصفحة">
          <a href="/#platform" className="transition-colors hover:text-primary">المميزات</a>
          <a href="/#pricing" className="transition-colors hover:text-primary">الباقات</a>
          <a href="/#faq" className="transition-colors hover:text-primary">FAQ</a>
          <Link href="/download" className="flex items-center gap-1.5 font-bold text-primary transition-colors hover:text-primary/80">
            <Smartphone className="size-4" />
            تطبيق الأندرويد
          </Link>
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {dashboardHref ? (
            <Button className="px-3 sm:px-4" nativeButton={false} render={<Link href={dashboardHref}><span className="sm:hidden">لوحة التحكم</span><span className="hidden sm:inline">الذهاب إلى لوحة التحكم</span></Link>} />
          ) : (
            <>
              <Button variant="ghost" className="px-2.5 sm:px-4" nativeButton={false} render={<Link href="/login"><span className="sm:hidden">دخول</span><span className="hidden sm:inline">تسجيل الدخول</span></Link>} />
              <Button className="px-3 sm:px-4" nativeButton={false} render={<Link href="/register"><span className="sm:hidden">ابدأ</span><span className="hidden sm:inline">ابدأ مجانًا</span></Link>} />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
