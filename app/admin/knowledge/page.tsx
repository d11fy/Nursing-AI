import { redirect } from 'next/navigation';
import { getAdminProfileOrNull } from '@/lib/auth';
import { identityDb } from '@/lib/tutor/db';
import { getAcademicYears } from '@/lib/subjects';
import { UploadDocumentDialog } from '@/components/admin/upload-document-dialog';
import { KnowledgeActions } from '@/components/admin/knowledge-actions';
import { StatusBadge } from '@/components/ui/status-badge';
export default async function KnowledgePage() {
  const admin=await getAdminProfileOrNull();if(!admin)redirect('/dashboard');
  const db=identityDb(admin.user_id);
  const [documents,subjects,years,gaps,coverage]=await Promise.all([
    db.query<{id:string;title:string;name_ar:string;status:string;source_type:string;source_priority:number;is_active:boolean;page_count:number;extracted_text_length:number;chunk_count:number;embedding_count:number;processing_time_ms:number|null;processed_at:string|null;error_message:string|null}>(`
      select d.*,s.name_ar from knowledge_documents d left join subjects s on s.id=d.subject_id where d.owner_id is null order by d.created_at desc`),
    db.query<{id:string;name_ar:string}>('select id,name_ar from subjects where status=\'active\' and archived_at is null order by sort_order'),getAcademicYears(),
    db.query<{topic:string;count:number;reason:string;name_ar:string}>(`select g.topic,g.reason,s.name_ar,count(*)::int count from curriculum_gaps g
      left join subjects s on s.id=g.subject_id group by g.topic,g.reason,s.name_ar order by count(*) desc limit 30`),
    db.query<{name_ar:string;documents:number;pages:number;chunks:number;last_indexed:string|null;questions:number;fallbacks:number;clarifications:number}>(`
      select s.name_ar,(select count(*) from knowledge_documents d where d.subject_id=s.id and d.owner_id is null)::int documents,
      (select coalesce(sum(page_count),0) from knowledge_documents d where d.subject_id=s.id and d.owner_id is null)::int pages,
      (select coalesce(sum(chunk_count),0) from knowledge_documents d where d.subject_id=s.id and d.owner_id is null)::int chunks,
      (select max(processed_at)::text from knowledge_documents d where d.subject_id=s.id and d.owner_id is null) last_indexed,
      (select count(*) from messages m join conversations c on c.id=m.conversation_id where c.subject_id=s.id and m.answer_origin is not null)::int questions,
      (select count(*) from curriculum_gaps g where g.subject_id=s.id and g.reason='general_knowledge')::int fallbacks,
      (select count(*) from curriculum_gaps g where g.subject_id=s.id and g.reason='clarification')::int clarifications
      from subjects s where s.status='active' order by s.sort_order`),
  ]);
  const labels:Record<string,string>={uploaded:'Uploaded',extracting:'Extracting',processing:'Processing',chunking:'Chunking',embedding:'Embedding',ready:'Ready',failed:'Failed',needs_review:'Needs Review'};
  return <div className="page-container mx-auto max-w-7xl space-y-6"><div className="flex items-center justify-between"><h1 className="text-xl font-bold">قاعدة المعرفة</h1><UploadDocumentDialog subjects={subjects.rows} academicYears={years}/></div>
    <p className="rounded-xl border bg-card p-4 text-sm">ارفع المصدر، راجع النص والمقاطع، ثم اعتمده للدراسة. يمكنك تعطيله دون حذف الملف. الملفات الخاصة لا تدخل المنهج المشترك تلقائيًا.</p>
    <div className="admin-table-scroll"><table className="w-full text-right text-sm"><thead><tr>{['المصدر','المادة','النوع / الأولوية','الحالة','صحة الملف','آخر فهرسة','الإجراءات'].map(label=><th key={label} className="p-3">{label}</th>)}</tr></thead>
    <tbody>{documents.rows.map(d=><tr key={d.id} className="border-t"><td className="p-3 font-medium">{d.title}<p className="text-xs text-muted-foreground">{d.is_active?'فعال':'غير فعال'}</p></td><td className="p-3">{d.name_ar}</td><td className="p-3">{d.source_type}<br/>{d.source_priority}</td><td className="p-3"><StatusBadge status={d.status}>{labels[d.status]}</StatusBadge>{d.error_message&&<p className="max-w-xs text-xs text-red-600">{d.error_message}</p>}</td>
      <td className="p-3 text-xs">Pages: {d.page_count}<br/>Characters: {d.extracted_text_length}<br/>Chunks: {d.chunk_count}<br/>Embeddings: {d.embedding_count}<br/>Time: {d.processing_time_ms?`${(d.processing_time_ms/1000).toFixed(1)}s`:'—'}</td>
      <td className="p-3 text-xs">{d.processed_at?new Date(d.processed_at).toLocaleString('ar',{timeZone:'Asia/Hebron'}):'—'}</td><td className="p-3"><KnowledgeActions id={d.id} active={d.is_active}/></td></tr>)}</tbody></table></div>
    <h2 className="font-semibold">تغطية المواد</h2><div className="admin-table-scroll"><table className="w-full text-right text-sm"><thead><tr>{['المادة','الملفات','الصفحات','المقاطع','الأسئلة','معرفة عامة','توضيح مطلوب','آخر فهرسة'].map(label=><th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{coverage.rows.map(row=><tr key={row.name_ar} className="border-t"><td className="p-3">{row.name_ar}</td>{[row.documents,row.pages,row.chunks,row.questions,row.fallbacks,row.clarifications].map((value,index)=><td key={index} className="p-3">{value}</td>)}<td className="p-3">{row.last_indexed?new Date(row.last_indexed).toLocaleString('ar-PS'):'—'}</td></tr>)}</tbody></table></div>
    <h2 className="font-semibold">Curriculum gaps — نقاط تحتاج مصادر أو توضيحًا</h2><div className="space-y-2">{gaps.rows.map((gap,index)=><div key={index} className="rounded border bg-card p-3 text-sm">{gap.name_ar} · {gap.topic} · {gap.count} طلب · {gap.reason==='clarification'?'توضيح مطلوب':'شرح من المعرفة العامة'}</div>)}{!gaps.rows.length&&<p className="text-sm text-muted-foreground">لا توجد بيانات بعد.</p>}</div>
  </div>;
}
