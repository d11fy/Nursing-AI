import { DollarSign, Users, MessagesSquare, TrendingUp, Cpu, Layers } from "lucide-react";
import { createClient } from "@/lib/db/server";
import { getPool } from "@/lib/db/pool";
import { StatCard } from "@/components/admin/stat-card";
import { UsageChart } from "@/components/admin/usage-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default async function AdminUsagePage() {
  const db = await createClient();
  const pool = getPool();

  const [{ data: statsRows }, { data: usageRows }, modelBreakdownRes, typeBreakdownRes, topStudentsRes] = await Promise.all([
    db.rpc("admin_dashboard_stats"),
    db.rpc("admin_usage_last_7_days"),
    pool.query<{ model: string; req_count: number; total_input_tokens: number; total_output_tokens: number; total_cost: number }>(`
      select coalesce(model, 'gpt-5.4-mini') as model, count(*)::int as req_count,
        coalesce(sum(input_tokens), 0)::bigint as total_input_tokens,
        coalesce(sum(output_tokens), 0)::bigint as total_output_tokens,
        coalesce(sum(estimated_cost), 0)::numeric as total_cost
      from usage_logs group by model order by total_cost desc
    `),
    pool.query<{ usage_type: string; req_count: number; total_cost: number }>(`
      select type::text as usage_type, count(*)::int as req_count,
        coalesce(sum(estimated_cost), 0)::numeric as total_cost
      from usage_logs group by type order by req_count desc
    `),
    pool.query<{ user_id: string; full_name: string; email: string; req_count: number; total_cost: number }>(`
      select p.user_id, p.full_name, p.email, count(u.id)::int as req_count,
        coalesce(sum(u.estimated_cost), 0)::numeric as total_cost
      from profiles p
      join usage_logs u on u.user_id = p.user_id
      group by p.user_id, p.full_name, p.email
      order by req_count desc limit 5
    `),
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
    <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">إحصائيات واستخدام الذكاء الاصطناعي (OpenAI)</h1>
        <p className="mt-1 text-sm text-muted-foreground">مراقبة التكاليف، النماذج المستخدمة، واستهلاك الطلاب للخدمة</p>
      </div>

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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="size-4" />
              النماذج واستهلاك التوكنز
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>النموذج</TableHead>
                  <TableHead>الطلبات</TableHead>
                  <TableHead>Input Tokens</TableHead>
                  <TableHead>Output Tokens</TableHead>
                  <TableHead>التكلفة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {modelBreakdownRes.rows.map((row) => (
                  <TableRow key={row.model}>
                    <TableCell className="font-mono text-xs">{row.model}</TableCell>
                    <TableCell>{row.req_count}</TableCell>
                    <TableCell className="text-xs">{Number(row.total_input_tokens).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{Number(row.total_output_tokens).toLocaleString()}</TableCell>
                    <TableCell className="font-semibold text-emerald-600">${Number(row.total_cost).toFixed(4)}</TableCell>
                  </TableRow>
                ))}
                {!modelBreakdownRes.rows.length && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">لا توجد بيانات بعد</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="size-4" />
              توزيع الطلبات حسب النوع
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نوع الطلب</TableHead>
                  <TableHead>عدد الطلبات</TableHead>
                  <TableHead>التكلفة الإجمالية</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {typeBreakdownRes.rows.map((row) => (
                  <TableRow key={row.usage_type}>
                    <TableCell>
                      <Badge variant="outline">{row.usage_type}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{row.req_count}</TableCell>
                    <TableCell className="text-emerald-600 font-semibold">${Number(row.total_cost).toFixed(4)}</TableCell>
                  </TableRow>
                ))}
                {!typeBreakdownRes.rows.length && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">لا توجد بيانات بعد</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4" />
            أكثر الطلاب استخداماً للمنصة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الطالب</TableHead>
                <TableHead>البريد الإلكتروني</TableHead>
                <TableHead>عدد الأسئلة والطلبات</TableHead>
                <TableHead>التكلفة التقديرية</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topStudentsRes.rows.map((row) => (
                <TableRow key={row.user_id}>
                  <TableCell className="font-medium">{row.full_name}</TableCell>
                  <TableCell dir="ltr" className="text-left text-xs">{row.email}</TableCell>
                  <TableCell>{row.req_count}</TableCell>
                  <TableCell className="text-emerald-600 font-semibold">${Number(row.total_cost).toFixed(4)}</TableCell>
                </TableRow>
              ))}
              {!topStudentsRes.rows.length && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">لا يوجد طلاب نشطون بعد</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
