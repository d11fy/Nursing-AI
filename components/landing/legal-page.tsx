import type { ReactNode } from "react";
import { LandingFooter } from "@/components/landing/footer";
import { LandingHeader } from "@/components/landing/header";

export interface LegalSection {
  title: string;
  content: ReactNode;
}

export function LegalPage({
  dashboardHref,
  eyebrow,
  title,
  intro,
  sections,
}: {
  dashboardHref: string | null;
  eyebrow: string;
  title: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <LandingHeader dashboardHref={dashboardHref} />
      <main className="flex-1">
        <header className="border-b border-border bg-muted/35">
          <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">{title}</h1>
            <p className="mt-5 max-w-3xl leading-8 text-muted-foreground">{intro}</p>
            <p className="mt-4 text-xs font-semibold text-muted-foreground">آخر تحديث: 7 أكتوبر 2026</p>
          </div>
        </header>
        <div className="mx-auto max-w-4xl space-y-5 px-4 py-12 sm:px-6">
          {sections.map((section) => (
            <section key={section.title} className="rounded-2xl border border-border bg-card p-5 sm:p-7">
              <h2 className="text-lg font-black text-foreground">{section.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-8 text-muted-foreground">{section.content}</div>
            </section>
          ))}
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
