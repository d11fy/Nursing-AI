import Link from "next/link";
import { BarChart3, BookOpen, Brain, CircleAlert, ClipboardCheck, Target } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getProgressDashboard } from "@/lib/learning-progress/service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { TargetedReviewLauncher } from "@/components/dashboard/targeted-review-launcher";

const label = { insufficient: "بيانات غير كافية", needs_review: "يحتاج مراجعة", developing: "قيد التطور", good: "جيد", strong: "قوي" } as const;

export default async function LearningProgressPage() {
  const profile = await requireProfile();
  const data = await getProgressDashboard(profile.user_id);
  const hasData = data.topics.length > 0;
  return <div className="page-container mx-auto max-w-5xl space-y-7">
    <PageHeader icon={BarChart3} eyebrow="تحليلات تعلمك" title="تقدم التعلم" description="قياس مبني على إجاباتك الفعلية، أخطائك، ومراجعات البطاقات—بدون أرقام تقديرية." actions={data.weakTopics.length ? <TargetedReviewLauncher /> : undefined} />
    {!hasData ? <EmptyState icon={Brain} title="لسا بدنا بيانات أكثر لتحديد مستواك" description="ابدأ بحل Quiz أو مراجعة Flashcards حتى نقدر نحدد نقاط قوتك والمواضيع التي تحتاج مراجعة." action={<Button nativeButton={false} render={<Link href="/dashboard/subjects">اذهب إلى المواد</Link>} />} /> : <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="ملخص التقدم">
        {[{ title: "التقدم العام", value: data.summary.overallMastery == null ? "غير كافٍ" : `${data.summary.overallMastery}%`, icon: Brain },
          { title: "مواد دُرست", value: data.summary.subjectsStudied, icon: BookOpen },
          { title: "أسئلة أُجيبت", value: data.summary.questionsAnswered, icon: ClipboardCheck },
          { title: "أخطاء حالية", value: data.summary.currentMistakes, icon: CircleAlert },
          { title: "تحتاج مراجعة", value: data.summary.topicsNeedingReview, icon: Target }].map((item) => <Card key={item.title} className="min-w-0 last:col-span-2 lg:last:col-span-1"><CardContent className="space-y-2 pt-1"><item.icon className="size-4 text-primary" /><p className="text-xs text-muted-foreground">{item.title}</p><p className="break-words text-xl font-black">{item.value}</p></CardContent></Card>)}
      </section>
      {data.recommendation && <Card className="border-amber-500/20 bg-amber-500/5"><CardContent className="flex flex-col items-start gap-3 pt-1 sm:flex-row sm:items-center"><span className="icon-tile shrink-0 text-amber-700"><Target className="size-5" /></span><div className="min-w-0 flex-1"><p className="font-bold">توصية المراجعة التالية</p><p dir="auto" className="mt-1 break-words text-sm text-muted-foreground [unicode-bidi:plaintext]">{data.recommendation}</p></div><TargetedReviewLauncher subjectId={data.weakTopics[0]?.subjectId ?? undefined} topicKey={data.weakTopics[0]?.topicKey} compact /></CardContent></Card>}
      <section className="space-y-3"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-extrabold">تقدم المواد</h2><span className="text-xs text-muted-foreground">حسب الدليل المتوفر</span></div>
        <div className="grid gap-3 md:grid-cols-2">{data.subjects.map((subject) => <Card key={subject.subjectId}><CardHeader><CardTitle dir="auto" className="break-words [unicode-bidi:plaintext]">{subject.subjectName}</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex items-center justify-between text-sm"><span>{subject.masteryScore == null ? "بيانات غير كافية" : `${subject.masteryScore}%`}</span><span className="text-xs text-muted-foreground">{subject.topicsStudied} مواضيع · {subject.questionsAnswered} أسئلة</span></div><Progress value={subject.masteryScore ?? 0} /><div className="flex items-center justify-between gap-2"><Badge variant="outline">{subject.weakTopics} مواضيع ضعيفة</Badge><Button nativeButton={false} variant="ghost" size="sm" render={<Link href={`/dashboard/subjects/${subject.subjectId}`}>فتح المادة</Link>} /></div></CardContent></Card>)}</div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2"><section className="space-y-3"><h2 className="text-lg font-extrabold">تحتاج انتباهك</h2>{data.weakTopics.length ? data.weakTopics.slice(0, 6).map((topic) => <Card key={`${topic.subjectId}-${topic.topicKey}`} size="sm"><CardContent className="space-y-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p dir="auto" className="break-words font-bold [unicode-bidi:plaintext]">{topic.topicName}</p><p dir="auto" className="text-xs text-muted-foreground [unicode-bidi:plaintext]">{topic.subjectName}</p></div><span className="font-black text-amber-700">{topic.masteryScore}%</span></div><Progress value={topic.masteryScore} /><p className="text-xs leading-6 text-muted-foreground">بناءً على {topic.quizAnswerCount} أسئلة، {topic.mistakeCount} أخطاء، و{topic.flashcardReviewCount} بطاقات Review Again.</p><TargetedReviewLauncher subjectId={topic.subjectId ?? undefined} topicKey={topic.topicKey} compact /></CardContent></Card>) : <Card size="sm"><CardContent className="text-sm text-muted-foreground">لا توجد مواضيع مصنفة كضعيفة بعد. هذا لا يعني الإتقان قبل اكتمال الدليل.</CardContent></Card>}</section>
        <section className="space-y-3"><h2 className="text-lg font-extrabold">مواضيع قوية</h2>{data.strongTopics.length ? data.strongTopics.slice(0, 5).map((topic) => <Card key={`${topic.subjectId}-${topic.topicKey}`} size="sm"><CardContent className="flex items-center justify-between gap-3"><div className="min-w-0"><p dir="auto" className="break-words font-bold [unicode-bidi:plaintext]">{topic.topicName}</p><p className="text-xs text-muted-foreground">{topic.evidenceCount} تفاعلات ذات معنى</p></div><Badge>{topic.masteryScore}% · {label[topic.label]}</Badge></CardContent></Card>) : <Card size="sm"><CardContent className="text-sm text-muted-foreground">ستظهر هنا المواضيع التي تحقق 85% أو أكثر بعد وجود دليل كافٍ.</CardContent></Card>}</section></div>
    </>}
  </div>;
}
