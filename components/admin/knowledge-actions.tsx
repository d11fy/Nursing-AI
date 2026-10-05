'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog,DialogContent,DialogHeader,DialogTitle } from '@/components/ui/dialog';
export function KnowledgeActions({id,active}:{id:string;active:boolean}) {
  const router=useRouter(),[preview,setPreview]=useState<{document:{title:string;extracted_pages_json:Array<{pageNumber:number|null;text:string}>};chunks:Array<{id:string;content:string;page_number:number|null}>}|null>(null),[busy,setBusy]=useState(false);
  async function action(value:string){setBusy(true);try{
    const response=await fetch(`/api/admin/knowledge/${id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:value})});
    const data=await response.json();if(!response.ok)throw new Error(data.error);toast.success(value==='reprocess'?'أضيف الملف لطابور المعالجة':'تم تحديث المصدر');router.refresh();
  }catch(error){toast.error(error instanceof Error?error.message:'تعذر تحديث المصدر');}finally{setBusy(false);}}
  async function show(){setBusy(true);try{const response=await fetch(`/api/admin/knowledge/${id}`),data=await response.json();if(!response.ok)throw new Error(data.error);setPreview(data);}catch{toast.error('تعذرت المعاينة');}finally{setBusy(false);}}
  return <><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={show}>معاينة</Button>
    <Button size="sm" variant="outline" disabled={busy} onClick={()=>action('reprocess')}>إعادة المعالجة</Button>
    <Button size="sm" variant="outline" disabled={busy} onClick={()=>action(active?'deactivate':'activate')}>{active?'إخفاء':'نشر'}</Button>
    <Button size="sm" variant="destructive" disabled={busy} onClick={()=>action('archive')}>أرشفة</Button></div>
    <Dialog open={Boolean(preview)} onOpenChange={open=>{if(!open)setPreview(null);}}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle>{preview?.document.title}</DialogTitle></DialogHeader>
      <details><summary>النص المستخرج حسب الصفحة</summary>{preview?.document.extracted_pages_json.map((page,index)=><pre key={index} className="my-3 whitespace-pre-wrap rounded border p-3 text-xs">Page {page.pageNumber??index+1}{'\n'}{page.text}</pre>)}</details>
      {preview?.chunks.map(chunk=><pre key={chunk.id} className="whitespace-pre-wrap rounded border p-3 text-xs">Page {chunk.page_number??'—'}{'\n'}{chunk.content}</pre>)}
    </DialogContent></Dialog></>;
}
