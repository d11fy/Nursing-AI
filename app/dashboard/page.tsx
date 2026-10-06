import Link from "next/link";
import { MessageSquare, History, BookOpen, ArrowLeft, Gauge, Clock3 } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { checkDailyLimit } from "@/lib/usage";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default async function DashboardHomePage() {
  const profile = await requireProfile();
  const db = await createClient();
  const { used, limit } = await checkDailyLimit(db, profile.user_id);

  const { data: recentConversations } = await db
    .from("conversations")
    .select("id, title, updated_at")
    .eq("user_id", profile.user_id)
    .order("updated_at", { ascending: false })
    .limit(5);

  return (
    <div className="page-container mx-auto max-w-5xl space-y-8">
      <PageHeader
        eyebrow="لوحة الدراسة"
        title={<>مرحبًا، {profile.full_name.split(" ")[0]}</>}
        description="ابدأ جلسة جديدة أو تابع من حيث توقفت في موادك ومحادثاتك."
      />

      <Card className="border-primary/10 bg-card">
        <CardHeader className="grid grid-cols-[1fr_auto] items-center">
          <div>
          <CardTitle className="flex items-center gap-2 text-base"><Gauge className="size-4 text-primary" /> استخدامك اليوم</CardTitle>
          <CardDescription>
            {used} / {limit} سؤال اليوم
          </CardDescription>
          </div>
          <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-primary">{Math.max(0, limit - used)} متبقٍ</span>
        </CardHeader>
        <CardContent>
          <Progress value={Math.min(100, (used / limit) * 100)} />
        </CardContent>
      </Card>

      <section aria-labelledby="quick-actions-title">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="quick-actions-title" className="text-lg font-extrabold text-foreground">ابدأ الدراسة</h2>
          <span className="text-xs text-muted-foreground">وصول سريع</span>
        </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/dashboard/chat">
          <Card className="interactive-card h-full">
            <CardContent className="flex min-h-40 flex-col items-start gap-3 pt-6 text-start">
              <span className="icon-tile">
                <MessageSquare className="size-6" />
              </span>
              <span className="font-bold text-foreground">محادثة جديدة</span>
              <span className="text-xs leading-6 text-muted-foreground">اسأل عن موضوع أو ارفع ملفًا دراسيًا.</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/history">
          <Card className="interactive-card h-full">
            <CardContent className="flex min-h-40 flex-col items-start gap-3 pt-6 text-start">
              <span className="icon-tile">
                <History className="size-6" />
              </span>
              <span className="font-bold text-foreground">المحادثات السابقة</span>
              <span className="text-xs leading-6 text-muted-foreground">ارجع إلى الشروحات والأسئلة السابقة.</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/subjects">
          <Card className="interactive-card h-full">
            <CardContent className="flex min-h-40 flex-col items-start gap-3 pt-6 text-start">
              <span className="icon-tile">
                <BookOpen className="size-6" />
              </span>
              <span className="font-bold text-foreground">المواد الدراسية</span>
              <span className="text-xs leading-6 text-muted-foreground">تصفّح مساقاتك ومحاضرات كل مادة.</span>
            </CardContent>
          </Card>
        </Link>
      </div>
      </section>

      {recentConversations && recentConversations.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-foreground">
            <Clock3 className="size-5 text-primary" />
            آخر محادثاتك
          </h2>
          <div className="space-y-2">
            {recentConversations.map((c) => (
              <Link key={c.id} href={`/dashboard/chat/${c.id}`}>
                <Card className="interactive-card">
                  <CardContent className="flex min-w-0 items-center justify-between gap-2 py-3">
                    <span dir="auto" className="min-w-0 break-words text-sm font-semibold leading-6 text-foreground [unicode-bidi:plaintext]">
                      {c.title}
                    </span>
                    <Button variant="ghost" size="sm" className="shrink-0 text-primary">
                      فتح <ArrowLeft className="size-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
      {(!recentConversations || recentConversations.length === 0) && (
        <EmptyState icon={MessageSquare} title="لا توجد محادثات بعد" description="ابدأ أول سؤال لك وستظهر محادثاتك الحديثة هنا." action={<Button nativeButton={false} render={<Link href="/dashboard/chat">ابدأ محادثة</Link>} />} />
      )}
    </div>
  );
}
