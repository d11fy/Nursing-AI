import { CircleAlert } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getMistakes } from "@/lib/learning-progress/service";
import type { MistakeStatus } from "@/lib/learning-progress/types";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { MistakeReviewCard } from "@/components/dashboard/mistake-review-card";

export default async function MistakesPage({ searchParams }: { searchParams: Promise<{ subject?: string; topic?: string; status?: string }> }) {
  const profile = await requireProfile();
  const params = await searchParams;
  const validStatus = ["new", "reviewing", "mastered"].includes(params.status ?? "") ? params.status as MistakeStatus : undefined;
  const [all, mistakes] = await Promise.all([getMistakes(profile.user_id), getMistakes(profile.user_id,
    { subjectId: params.subject, topicKey: params.topic, status: validStatus })]);
  const subjects = [...new Map(all.map((item) => [item.subjectId, item.subjectName])).entries()];
  const topics = [...new Map(all.map((item) => [item.topicKey, item.topic])).entries()];
  const current = all.filter((item) => item.status !== "mastered");
  const topTopic = [...new Map(all.map((item) => [item.topic, all.filter((other) => other.topicKey === item.topicKey).reduce((sum, entry) => sum + entry.wrongCount, 0)]))]
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  return <div className="page-container mx-auto max-w-4xl space-y-6">
    <PageHeader icon={CircleAlert} eyebrow="مراجعة موجهة" title="أخطائي" description="أسئلة أخطأت بها فعلًا، محفوظة مع التفسير والمصدر لتراجعها وتتأكد من التعافي." />
    {all.length ? <><section className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-3"><div className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">أخطاء حالية</p><p className="mt-2 text-2xl font-black">{current.length}</p></div><div className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">مواد فيها أخطاء</p><p className="mt-2 text-2xl font-black">{subjects.length}</p></div><div className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">الأكثر تكرارًا</p><p dir="auto" className="mt-2 break-words font-bold [unicode-bidi:plaintext]">{topTopic}</p></div></section>
      <form className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-3" method="get"><label className="space-y-1.5 text-xs font-bold">المادة<select name="subject" defaultValue={params.subject ?? ""} className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-sm"><option value="">كل المواد</option>{subjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label className="space-y-1.5 text-xs font-bold">الموضوع<select name="topic" defaultValue={params.topic ?? ""} className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-sm"><option value="">كل المواضيع</option>{topics.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label className="space-y-1.5 text-xs font-bold">الحالة<div className="flex gap-2"><select name="status" defaultValue={params.status ?? ""} className="min-h-11 min-w-0 flex-1 rounded-xl border border-input bg-card px-3 text-sm"><option value="">كل الحالات</option><option value="new">جديد</option><option value="reviewing">قيد المراجعة</option><option value="mastered">تم إتقانه</option></select><button className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">تطبيق</button></div></label></form>
      <section className="space-y-4">{mistakes.length ? mistakes.map((mistake) => <MistakeReviewCard key={mistake.id} mistake={mistake} />) : <EmptyState icon={CircleAlert} title="لا توجد نتائج بهذه المرشحات" description="غيّر المادة أو الموضوع أو الحالة لرؤية أخطاء أخرى." />}</section></> : <EmptyState icon={CircleAlert} title="ممتاز، ما عندك أخطاء محفوظة حاليًا" description="هذا يعني فقط أنه لا توجد إجابات خاطئة مسجلة بعد، وليس حكمًا بأن كل المواضيع متقنة." />}
  </div>;
}

