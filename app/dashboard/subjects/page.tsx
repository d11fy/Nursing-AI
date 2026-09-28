import Link from "next/link";
import { BookOpen, GraduationCap, Calendar } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getStudentSubjects, type SubjectWithYears } from "@/lib/subjects";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
    <Card className="flex flex-col justify-between transition hover:shadow-md border-border/80">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
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
        <CardTitle className="text-base mt-2">{subject.name_ar}</CardTitle>
        <CardDescription dir="ltr" className="text-left text-xs line-clamp-1">
          {subject.name_en}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {subject.description_ar && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {subject.description_ar}
          </p>
        )}
        <Button size="sm" variant="outline" className="w-full" nativeButton={false} render={<Link href={`/dashboard/subjects/${subject.id}`}>ابدأ الدراسة</Link>} />
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
    <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-6">
      <div className="rounded-2xl border border-border bg-gradient-to-r from-blue-50/50 via-background to-teal-50/50 p-6 dark:from-blue-950/20 dark:to-teal-950/20">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <GraduationCap className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">الخطة والمواد الدراسية</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="size-4" />
              {academicYearName ?? "السنة الدراسية غير محددة"} • كلية التمريض - الجامعة الإسلامية بغزة
            </p>
          </div>
        </div>
      </div>

      {!subjects.length ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-slate-400">
          لا توجد مواد مضافة لسنتك الدراسية حتى الآن.
        </div>
      ) : (
        <div className="space-y-10">
          {semester1.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-blue-600 text-white text-xs">١</span>
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
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-teal-600 text-white text-xs">٢</span>
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
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
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
