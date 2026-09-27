import { Users, UserCheck, MessagesSquare, CalendarDays, ImageIcon, DollarSign } from "lucide-react";
import { createClient } from "@/lib/db/server";
import { StatCard } from "@/components/admin/stat-card";
import { UsageChart } from "@/components/admin/usage-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminDashboardPage() {
  const db = await createClient();

  const [{ data: statsRows }, { data: usageRows }] = await Promise.all([
    db.rpc("admin_dashboard_stats"),
    db.rpc("admin_usage_last_7_days"),
  ]);

  const stats = statsRows?.[0] ?? {
    total_students: 0,
    active_students: 0,
    questions_today: 0,
    questions_month: 0,
    images_uploaded: 0,
    cost_today: 0,
    cost_month: 0,
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">لوحة التحكم</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={Users} label="إجمالي الطلاب" value={stats.total_students} />
        <StatCard icon={UserCheck} label="الطلاب النشطون" value={stats.active_students} tone="teal" />
        <StatCard icon={MessagesSquare} label="الأسئلة اليوم" value={stats.questions_today} tone="amber" />
        <StatCard icon={CalendarDays} label="الأسئلة هذا الشهر" value={stats.questions_month} />
        <StatCard icon={ImageIcon} label="الصور المرفوعة" value={stats.images_uploaded} tone="teal" />
        <StatCard
          icon={DollarSign}
          label="تكلفة الذكاء الاصطناعي (الشهر)"
          value={`$${Number(stats.cost_month).toFixed(2)}`}
          tone="green"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الاستخدام آخر 7 أيام</CardTitle>
        </CardHeader>
        <CardContent>
          <UsageChart data={usageRows ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
