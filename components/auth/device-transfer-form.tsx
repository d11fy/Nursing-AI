"use client";
import { useState } from 'react';
export function DeviceTransferForm(){
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function submit(event:React.FormEvent<HTMLFormElement>,action:string){event.preventDefault();setBusy(true);const form=new FormData(event.currentTarget);
    try{const res=await fetch('/api/auth/device-transfer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...Object.fromEntries(form)})});const data=await res.json();if(!res.ok)throw new Error(data.error);
      if(action==='confirm')window.location.assign('/dashboard');else setMessage(data.message);
    }catch(e){setMessage(e instanceof Error?e.message:'تعذر النقل');}finally{setBusy(false);}
  }
  return <div className="space-y-6"><p>سيُغلق تسجيل الدخول على الجهاز السابق بعد تأكيد الرمز. تظل المواد والتقدم والاشتراك في حسابك.</p>
    <form className="space-y-4" onSubmit={e=>submit(e,'request')}><label className="block">البريد الإلكتروني<input name="email" type="email" autoComplete="email" required className="block w-full rounded-xl border p-3" /></label><label className="block">كلمة المرور<input name="password" type="password" autoComplete="current-password" required className="block w-full rounded-xl border p-3" /></label><button disabled={busy} className="min-h-12 rounded-xl border px-4">إرسال رمز النقل إلى بريدي</button></form>
    <form className="space-y-4" onSubmit={e=>submit(e,'confirm')}><label className="block">رمز النقل من الرسالة<input name="token" dir="ltr" required minLength={64} maxLength={64} className="block w-full rounded-xl border p-3" autoComplete="one-time-code" /></label><button disabled={busy} className="min-h-12 rounded-xl bg-primary px-4 text-primary-foreground">تأكيد النقل إلى هذا الجهاز</button></form>
    {message&&<p role="status">{message}</p>}
  </div>;
}
