import { useEffect,useRef,useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { apiFetch,getTokens,saveTokens } from '../services/api';
import { openSupport } from '../services/support';

export function DeviceTransferScreen({initialEmail=''}:{initialEmail?:string}){
  const {refreshAuth}=useAuth(),{goBack}=useNavigation();
  const [email,setEmail]=useState(initialEmail),[password,setPassword]=useState(''),[code,setCode]=useState('');
  const [masked,setMasked]=useState(''),[cooldown,setCooldown]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(!cooldown)return;const timer=setTimeout(()=>setCooldown(Math.max(0,cooldown-1)),1000);return()=>clearTimeout(timer);},[cooldown]);
  async function send(){setBusy(true);setError('');try{const result=await apiFetch('/api/auth/device-transfer',{method:'POST',body:JSON.stringify({action:'request',email,password})});setMasked(result.maskedEmail);setCooldown(result.retryAfterSeconds??60);setTimeout(()=>input.current?.focus(),0);}catch(e){setError(e instanceof Error?e.message:'تعذر إرسال الرمز');}finally{setBusy(false);}}
  async function confirm(){setBusy(true);setError('');try{const {deviceToken}=await getTokens();const result=await apiFetch('/api/auth/device-transfer',{method:'POST',body:JSON.stringify({action:'confirm',email,token:code,deviceToken:deviceToken||undefined})});await saveTokens(result.sessionToken,result.deviceToken);await refreshAuth();}catch(e){setError(e instanceof Error?e.message:'الرمز غير صحيح');}finally{setBusy(false);}}
  return <main className="min-h-screen bg-slate-50 dark:bg-slate-950 px-6 py-12" dir="rtl"><div className="mx-auto max-w-sm space-y-5"><button className="min-h-11 text-primary" onClick={goBack}>العودة إلى تسجيل الدخول</button><h1 className="text-2xl font-black">نقل الحساب إلى هذا الجهاز</h1><p className="text-sm">بعد تأكيد الرمز سيُغلق تسجيل الدخول على الجهاز السابق. ستبقى بياناتك في حسابك.</p>
    <form className="space-y-4" onSubmit={e=>{e.preventDefault();void send();}}><label className="block text-sm font-bold">البريد الإلكتروني<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 h-12 w-full rounded-2xl border bg-white p-3 text-slate-900" required /></label><label className="block text-sm font-bold">كلمة المرور<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 h-12 w-full rounded-2xl border bg-white p-3 text-slate-900" required /></label><button className="h-12 w-full rounded-2xl border text-primary font-bold" disabled={busy||cooldown>0}>{cooldown>0?`إعادة الإرسال بعد ${cooldown} ثانية`:'إرسال رمز النقل إلى بريدي'}</button></form>
    {masked&&<form className="space-y-4" onSubmit={e=>{e.preventDefault();void confirm();}}><p>أرسلنا رمز تحقق إلى: <bdi dir="ltr">{masked}</bdi></p><label className="block text-sm font-bold">رمز من 6 أرقام<input ref={input} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" maxLength={6} dir="ltr" className="mt-2 h-14 w-full rounded-2xl border bg-white p-3 text-center text-2xl tracking-[0.5em] text-slate-900" required /></label><button className="h-12 w-full rounded-2xl bg-primary text-white font-bold" disabled={busy||code.length!==6}>تأكيد النقل</button></form>}
    {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}<button className="min-h-12 text-primary underline" onClick={()=>void openSupport('مرحبًا، أواجه مشكلة في تسجيل الدخول أو نقل جهازي في Nursing AI.')}>طلب مساعدة عبر واتساب</button>
  </div></main>;
}
