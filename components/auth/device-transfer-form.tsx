"use client";
import { useEffect,useRef,useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
export function DeviceTransferForm(){
  const router=useRouter();
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState('');
  const [masked,setMasked]=useState(''),[cooldown,setCooldown]=useState(0),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const codeRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(!cooldown)return;const timer=setTimeout(()=>setCooldown(Math.max(0,cooldown-1)),1000);return()=>clearTimeout(timer);},[cooldown]);
  async function send(){setBusy(true);setMessage('');try{const res=await fetch('/api/auth/device-transfer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'request',email,password})});const data=await res.json();if(!res.ok)throw new Error(data.error);setMasked(data.maskedEmail);setCooldown(data.retryAfterSeconds??60);setMessage(data.message);setTimeout(()=>codeRef.current?.focus(),0);}catch(e){setMessage(e instanceof Error?e.message:'تعذر إرسال الرمز');}finally{setBusy(false);}}
  async function confirm(){setBusy(true);setMessage('');try{const res=await fetch('/api/auth/device-transfer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'confirm',email,token:code})});const data=await res.json();if(!res.ok)throw new Error(data.error);router.push('/dashboard');router.refresh();}catch(e){setMessage(e instanceof Error?e.message:'تعذر النقل');}finally{setBusy(false);}}
  return <div className="space-y-6"><p>سيُغلق تسجيل الدخول على الجهاز السابق بعد تأكيد الرمز. تظل موادك وتقدمك في حسابك.</p>
    <form className="space-y-4" onSubmit={e=>{e.preventDefault();void send();}}><label className="block">البريد الإلكتروني<input value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="email" required className="block w-full rounded-xl border p-3" /></label><label className="block">كلمة المرور<input value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="current-password" required className="block w-full rounded-xl border p-3" /></label><button disabled={busy||cooldown>0} className="min-h-12 rounded-xl border px-4">{cooldown>0?`إعادة الإرسال بعد ${cooldown} ثانية`:'إرسال رمز النقل'}</button></form>
    {masked&&<form className="space-y-4" onSubmit={e=>{e.preventDefault();void confirm();}}><p>أرسلنا رمز تحقق إلى: <bdi dir="ltr">{masked}</bdi></p><label className="block">رمز من 6 أرقام<input ref={codeRef} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" maxLength={6} dir="ltr" className="mt-2 block w-full rounded-xl border p-3 text-center text-2xl tracking-[0.55em]" required /></label><button disabled={busy||code.length!==6} className="min-h-12 rounded-xl bg-primary px-4 text-primary-foreground">تأكيد النقل إلى هذا الجهاز</button></form>}
    {message&&<p role="status">{message}</p>}<Link className="block min-h-11 text-primary underline" href="/support">طلب مساعدة</Link>
  </div>;
}
