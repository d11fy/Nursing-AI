import { BrandMark } from "@/components/brand/brand-mark";

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-card py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-4 text-center text-sm text-muted-foreground sm:flex-row sm:px-6 sm:text-start">
        <BrandMark />
        <p>© {new Date().getFullYear()} Nursing AI — منصة تعليمية لطلاب التمريض.</p>
      </div>
    </footer>
  );
}
