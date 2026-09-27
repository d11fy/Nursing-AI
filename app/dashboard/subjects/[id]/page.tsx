import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { ArrowRight, BookOpen } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { canStudentAccessSubject, getSubjectById } from "@/lib/subjects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SubjectDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const subject = await getSubjectById(id);
  if (!subject) notFound();
  if (!await canStudentAccessSubject(profile.user_id, id)) forbidden();
  return <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
    <Link href="/dashboard/subjects" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" />العودة إلى المواد</Link>
    <Card><CardHeader><div className="flex size-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950"><BookOpen /></div><CardTitle>{subject.name_ar}</CardTitle><p dir="ltr" className="text-sm text-muted-foreground">{subject.name_en}</p></CardHeader><CardContent className="space-y-5">
      {subject.description_ar && <p className="leading-7 text-muted-foreground">{subject.description_ar}</p>}
      <div className="flex flex-wrap gap-2 text-sm">{subject.academic_years.map(y => <span key={y.id} className="rounded-full bg-muted px-3 py-1">{y.name_ar}</span>)}</div>
      <Button nativeButton={false} render={<Link href={`/dashboard/chat?subject=${subject.id}`}>ابدأ محادثة</Link>} />
    </CardContent></Card>
  </div>;
}
