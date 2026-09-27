import Link from "next/link";
import { MessageSquare, History, BookOpen } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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

export default async function DashboardHomePage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { used, limit } = await checkDailyLimit(supabase, profile.user_id);

  const { data: recentConversations } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .eq("user_id", profile.user_id)
    .order("updated_at", { ascending: false })
    .limit(5);

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          مرحبًا، {profile.full_name.split(" ")[0]} 👋
        </h1>
        <p className="mt-1 text-slate-500">شو حابب تدرس اليوم؟</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">استخدامك اليوم</CardTitle>
          <CardDescription>
            {used} / {limit} سؤال اليوم
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={Math.min(100, (used / limit) * 100)} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/dashboard/chat">
          <Card className="h-full transition hover:shadow-md">
            <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                <MessageSquare className="size-6" />
              </span>
              <span className="font-medium text-slate-900 dark:text-white">محادثة جديدة</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/history">
          <Card className="h-full transition hover:shadow-md">
            <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-300">
                <History className="size-6" />
              </span>
              <span className="font-medium text-slate-900 dark:text-white">المحادثات السابقة</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/subjects">
          <Card className="h-full transition hover:shadow-md">
            <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300">
                <BookOpen className="size-6" />
              </span>
              <span className="font-medium text-slate-900 dark:text-white">المواد</span>
            </CardContent>
          </Card>
        </Link>
      </div>

      {recentConversations && recentConversations.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">
            آخر محادثاتك
          </h2>
          <div className="space-y-2">
            {recentConversations.map((c) => (
              <Link key={c.id} href={`/dashboard/chat/${c.id}`}>
                <Card className="transition hover:shadow-sm">
                  <CardContent className="flex items-center justify-between py-3">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {c.title}
                    </span>
                    <Button variant="ghost" size="sm">
                      فتح
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
