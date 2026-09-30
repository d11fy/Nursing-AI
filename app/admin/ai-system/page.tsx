import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAdminProfileOrNull } from '@/lib/auth';
import { tutorUsage } from '@/lib/tutor/admin-usage';
export default async function AISystemPage() {
  const admin=await getAdminProfileOrNull();if(!admin)redirect('/dashboard');const stats=await tutorUsage(admin.user_id);
  return <div className="mx-auto max-w-6xl space-y-6 p-6"><h1 className="text-xl font-bold">AI System</h1><div className="rounded-xl border bg-card p-5">
    <p className="font-semibold">GPT-6 Luna · OpenAI Responses API</p><p className="text-sm">Embeddings: text-embedding-3-small · PostgreSQL / pgvector / Full Text Search</p>
    <p className="mt-2 text-sm">الحالة: {stats.summary.last_success?'آخر طلب ناجح مسجل':process.env.OPENAI_API_KEY?'المفتاح مضبوط؛ يلزم طلب ناجح للتحقق':'OPENAI_API_KEY غير مضبوط'}</p>
    <p className="text-xs text-muted-foreground">آخر نجاح: {stats.summary.last_success??'—'} · وضع المحادثة: {process.env.AI_ARCHITECTURE==='legacy'?'Legacy rollback':'Personal tutor'}</p></div>
    <div className="grid gap-4 sm:grid-cols-4">{[['الأسئلة هذا الشهر',stats.summary.month_requests],['Input tokens',stats.summary.input_tokens],['Cached tokens',stats.summary.cached_tokens],['Output tokens',stats.summary.output_tokens]].map(([label,value])=><div key={label} className="rounded border bg-card p-4"><p className="text-sm">{label}</p><p className="text-2xl font-bold">{Number(value).toLocaleString()}</p></div>)}</div>
    <p className="rounded border bg-card p-4">المعرفة الفعالة: {stats.knowledge.ready} · تحتاج مراجعة: {stats.knowledge.needs_review} · طابور المعالجة: {stats.knowledge.queued}</p>
    <Link href="/admin/ai-usage" className="text-blue-600 underline">تفاصيل التكلفة والاستخدام</Link>
  </div>;
}
