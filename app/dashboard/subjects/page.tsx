import Link from "next/link";
import { BookOpen, Calendar, ArrowLeft, LibraryBig } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getStudentSubjects, type SubjectWithYears } from "@/lib/subjects";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

function getCourseTypeVariant(type?: string | null) {
  switch (type) {
    case "تخصص":
      return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800";
    case "كلية":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
    case "جامعة":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800";
    default:
      return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700";
  }
}

function SubjectCard({ subject }: { subject: SubjectWithYears }) {
  return (
    <Card className="interactive-card group flex h-full flex-col justify-between">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="icon-tile size-10 rounded-xl">
            <BookOpen className="size-5" />
          </div>
          <div className="flex flex-wrap gap-1 justify-end">
            {subject.course_code && (
              <Badge variant="outline" className="font-mono text-xs font-semibold">
                {subject.course_code}
              </Badge>
            )}
            {subject.course_type && (
              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${getCourseTypeVariant(subject.course_type)}`}>
                {subject.course_type}
              </span>
            )}
          </div>
        </div>
        <CardTitle className="text-lg mt-3 leading-relaxed">{subject.name_ar}</CardTitle>
        <CardDescription dir="ltr" className="text-start text-sm line-clamp-2">
          {subject.name_en}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {subject.description_ar && (
          <p className="text-sm leading-7 text-muted-foreground line-clamp-2">
            {subject.description_ar}
          </p>
        )}
        <Button size="sm" variant="outline" className="w-full bg-card text-primary group-hover:border-primary/30 group-hover:bg-accent" nativeButton={false} render={<Link href={`/dashboard/subjects/${subject.id}`}>ابدأ الدراسة <ArrowLeft className="size-3.5" /></Link>} />
      </CardContent>
    </Card>
  );
}

export default async function SubjectsPage() {
  const profile = await requireProfile();
  const { subjects, academicYearName } = await getStudentSubjects(profile.user_id);

  const semester1 = subjects.filter((s) => s.semester === 1);
  const semester2 = subjects.filter((s) => s.semester === 2);
  const generalSubjects = subjects.filter((s) => s.semester !== 1 && s.semester !== 2);

  return (
    <div className="page-container mx-auto max-w-5xl space-y-8">
      <PageHeader
        icon={LibraryBig}
        eyebrow="مساقاتك الأكاديمية"
        title="الخطة والمواد الدراسية"
        description={<span className="flex flex-wrap items-center gap-2"><Calendar className="size-4" /> {academicYearName ?? "السنة الدراسية غير محددة"}<span aria-hidden="true">·</span> كلية التمريض - الجامعة الإسلامية بغزة</span>}
      />

      {!subjects.length ? (
        <EmptyState icon={BookOpen} title="لا توجد مواد لسنتك الدراسية" description="ستظهر المساقات هنا بعد إضافتها إلى الخطة الدراسية من الإدارة." />
      ) : (
        <div className="space-y-10">
          {semester1.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h2 className="flex items-center gap-2 text-lg font-extrabold text-foreground">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">١</span>
                  الفصل الدراسي الأول
                </h2>
                <span className="text-xs text-muted-foreground">{semester1.length} مساقات</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {semester1.map((subject) => (
                  <SubjectCard key={subject.id} subject={subject} />
                ))}
              </div>
            </section>
          )}

          {semester2.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h2 className="flex items-center gap-2 text-lg font-extrabold text-foreground">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">٢</span>
                  الفصل الدراسي الثاني
                </h2>
                <span className="text-xs text-muted-foreground">{semester2.length} مساقات</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {semester2.map((subject) => (
                  <SubjectCard key={subject.id} subject={subject} />
                ))}
              </div>
            </section>
          )}

          {generalSubjects.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h2 className="text-lg font-extrabold text-foreground">
                  مساقات عامة
                </h2>
                <span className="text-xs text-muted-foreground">{generalSubjects.length} مساقات</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {generalSubjects.map((subject) => (
                  <SubjectCard key={subject.id} subject={subject} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
