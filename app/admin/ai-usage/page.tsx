import { redirect } from 'next/navigation';
import { getAdminProfileOrNull } from '@/lib/auth';
import { tutorUsage } from '@/lib/tutor/admin-usage';
export default async function AIUsagePage() {
  const admin=await getAdminProfileOrNull();if(!admin)redirect('/dashboard');const stats=await tutorUsage(admin.user_id);
  const money=(value:number)=>`$${Number(value).toFixed(6)}`;
  return <div className="page-container mx-auto max-w-6xl space-y-6"><h1 className="text-xl font-bold">تكاليف الذكاء الاصطناعي</h1>
    <p className="text-sm text-muted-foreground">تقديرات بالدولار حسب الاستخدام المبلغ من OpenAI مع خصم Cached input. تاريخ اليوم والشهر بتوقيت فلسطين. هذه الأرقام ليست فاتورة المزود.</p>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['Today',money(stats.summary.today_cost)],['This month',money(stats.summary.month_cost)],['Questions today',stats.summary.today_requests],['Average API request',money(stats.summary.avg_cost)]].map(([label,value])=><div key={label} className="rounded-2xl border border-border bg-card p-5"><p className="text-sm">{label}</p><p className="text-2xl font-bold">{value}</p></div>)}</div>
    <div className="admin-table-scroll"><table className="w-full text-sm"><thead><tr><th className="p-3">الميزة</th><th>الطلبات</th><th>التكلفة</th></tr></thead><tbody>{stats.features.map(row=><tr key={row.feature} className="border-t"><td className="p-3">{row.feature}</td><td>{row.requests}</td><td>{money(row.cost)}</td></tr>)}</tbody></table></div>
    <h2 className="font-semibold">التكلفة لكل طالب</h2><div className="admin-table-scroll"><table className="w-full text-sm"><thead><tr><th className="p-3">الطالب</th><th>طلبات API</th><th>التكلفة</th></tr></thead><tbody>{stats.students.map(row=><tr key={row.user_id} className="border-t"><td className="p-3">{row.full_name}</td><td>{row.requests}</td><td>{money(row.cost)}</td></tr>)}</tbody></table></div>
  </div>;
}
