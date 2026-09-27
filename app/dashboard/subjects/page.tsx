import Link from "next/link";
import { BookOpen } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getStudentSubjects } from "@/lib/subjects";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function SubjectsPage() {
  const profile = await requireProfile();
  const { subjects, academicYearName } = await getStudentSubjects(profile.user_id);
  return <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
    <div><h1 className="text-xl font-bold">المواد الدراسية</h1><p className="mt-1 text-sm text-muted-foreground">{academicYearName ?? "السنة الدراسية غير محددة"}</p></div>
    <div className="grid gap-4 sm:grid-cols-2">{subjects.map(subject => <Card key={subject.id}>
      <CardHeader><div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300"><BookOpen className="size-5" /></div><CardTitle className="text-base">{subject.name_ar}</CardTitle><CardDescription dir="ltr" className="text-left">{subject.name_en}</CardDescription></CardHeader>
      <CardContent>{subject.description_ar && <p className="mb-4 text-sm text-slate-500">{subject.description_ar}</p>}<Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/dashboard/subjects/${subject.id}`}>ابدأ الدراسة</Link>} /></CardContent>
    </Card>)}</div>
    {!subjects.length && <div className="rounded-xl border border-dashed border-border py-16 text-center text-slate-400">لا توجد مواد مضافة لسنتك الدراسية حتى الآن.</div>}
  </div>;
}
