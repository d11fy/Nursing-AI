"use client";
import { useState } from "react";
export function SupportForm(){
  const [message,setMessage]=useState(""),[token,setToken]=useState(""),[busy,setBusy]=useState(false);
  async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);const form=new FormData(e.currentTarget);
    try{const body=Object.fromEntries(form);const response=await fetch("/api/support",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error);
      if(data.token){setToken(data.token);setMessage("تم استلام طلبك. احفظ رمز المتابعة لقراءة رد الإدارة من هذه الصفحة.");}else setMessage(data.ticket.reply||"طلبك قيد المراجعة. لم يصل رد بعد.");
    }catch(error){setMessage(error instanceof Error?error.message:"تعذر إرسال الطلب");}finally{setBusy(false);}}
  return <div className="space-y-8"><p role="status" className="whitespace-pre-wrap">{message}</p>{token&&<p>رمز المتابعة (خاص بك): <code dir="ltr" className="block break-all rounded-xl border p-3">{token}</code></p>}
    <form onSubmit={submit} className="space-y-4"><h2 className="text-lg font-bold">طلب مساعدة</h2><p>لا ترسل كلمة مرور أو بيانات مرضى أو معلومات دفع كاملة.</p>
      <label className="block">بريدك<input required name="email" type="email" autoComplete="email" maxLength={254} className="block w-full rounded-xl border p-3" dir="ltr" /></label>
      <label className="block">الموضوع<input required name="subject" minLength={3} maxLength={120} className="block w-full rounded-xl border p-3" /></label>
      <label className="block">كيف نساعدك؟<textarea required name="message" minLength={10} maxLength={3000} rows={5} className="block w-full rounded-xl border p-3" /></label>
      <button disabled={busy} className="min-h-12 rounded-xl bg-primary px-5 text-primary-foreground">إرسال طلب المساعدة</button></form>
    <form onSubmit={submit} className="space-y-4 border-t pt-5"><h2 className="text-lg font-bold">متابعة طلب سابق</h2><input type="hidden" name="action" value="status" /><label className="block">رمز المتابعة<input required name="token" autoComplete="off" maxLength={48} className="block w-full rounded-xl border p-3" dir="ltr" /></label><button disabled={busy} className="min-h-12 rounded-xl border px-5">عرض رد الإدارة</button></form>
  </div>;
}
