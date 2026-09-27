import { DollarSign, Users, MessagesSquare, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/db/server";
import { StatCard } from "@/components/admin/stat-card";
import { UsageChart } from "@/components/admin/usage-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminUsagePage() {
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

  const avgCostPerStudent =
    stats.total_students > 0 ? Number(stats.cost_month) / stats.total_students : 0;
  const avgCostPerQuestion =
    stats.questions_month > 0 ? Number(stats.cost_month) / stats.questions_month : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">استخدام الذكاء الاصطناعي</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={DollarSign} label="التكلفة التقديرية اليوم" value={`$${Number(stats.cost_today).toFixed(3)}`} tone="green" />
        <StatCard icon={DollarSign} label="التكلفة التقديرية هذا الشهر" value={`$${Number(stats.cost_month).toFixed(2)}`} tone="green" />
        <StatCard icon={Users} label="متوسط التكلفة لكل طالب" value={`$${avgCostPerStudent.toFixed(3)}`} />
        <StatCard icon={MessagesSquare} label="متوسط التكلفة لكل سؤال" value={`$${avgCostPerQuestion.toFixed(4)}`} tone="amber" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="size-4" />
            الاستخدام آخر 7 أيام
          </CardTitle>
        </CardHeader>
        <CardContent>
          <UsageChart data={usageRows ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
