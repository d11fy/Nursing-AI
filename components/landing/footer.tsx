import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-mark";

const columns = [
  {
    title: "المنصة",
    links: [["الرئيسية", "/"], ["المميزات", "/#platform"], ["الباقات", "/#pricing"], ["تحميل التطبيق", "/download"]],
  },
  {
    title: "الدعم",
    links: [["الأسئلة الشائعة", "/#faq"], ["تواصل معنا", "/support"]],
  },
  {
    title: "القانوني",
    links: [["الخصوصية", "/privacy"], ["الشروط", "/terms"], ["سياسة الاشتراك", "/subscription-policy"], ["سياسة الملفات", "/file-policy"], ["التنويه التعليمي", "/disclaimer"]],
  },
] as const;

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.3fr_2fr]">
        <div><BrandMark /><p className="mt-4 max-w-sm text-sm leading-7 text-muted-foreground">منصة تعليمية تساعد طلاب التمريض على الفهم والمراجعة والتدرب ومتابعة التقدم عبر الويب والأندرويد.</p></div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {columns.map((column) => <div key={column.title}><h2 className="text-sm font-black text-foreground">{column.title}</h2><ul className="mt-4 space-y-3">{column.links.map(([label, href]) => <li key={href}><Link href={href} className="text-sm text-muted-foreground transition-colors hover:text-primary">{label}</Link></li>)}</ul></div>)}
        </div>
      </div>
      <div className="border-t border-border px-4 py-5 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} Nursing AI. جميع الحقوق محفوظة.</div>
    </footer>
  );
}
