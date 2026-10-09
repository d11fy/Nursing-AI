"use client";
import { useState } from "react";
import Link from "next/link";
export function SecurityForm({enabled,verified}:{enabled:boolean;verified:boolean}){
  const [secret,setSecret]=useState(""),[codes,setCodes]=useState<string[]>([]),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage("");const form=new FormData(event.currentTarget);
    try{const response=await fetch("/api/auth/mfa",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:enabled?"verify":secret?"confirm":"setup",password:form.get("password"),code:form.get("code")})});
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      if(data.secret)setSecret(data.secret);else if(data.recoveryCodes?.length){setCodes(data.recoveryCodes);setSecret("");}else window.location.assign("/admin");
    }catch(e){setMessage(e instanceof Error?e.message:"تعذر إكمال الطلب");}finally{setBusy(false);}
  }
  return <main className="mx-auto max-w-lg space-y-5 px-5 py-12" dir="rtl"><h1 className="text-2xl font-bold">حماية حساب الإدارة</h1>
    <p>استخدم تطبيق مصادقة لإنشاء رمز يتغير كل 30 ثانية. احتفظ برموز الاسترداد في مكان آمن خارج هذا الجهاز.</p>
    {message&&<p role="alert">{message}</p>}
    {codes.length ? <section className="space-y-4"><h2 className="font-bold">تم التفعيل — احفظ هذه الرموز الآن</h2><p>كل رمز يُستخدم مرة واحدة، ولن نعرضه مجددًا.</p><pre dir="ltr" className="rounded-xl border p-4">{codes.join("\n")}</pre><Link className="text-primary underline" href="/admin">حفظت الرموز، انتقل للإدارة</Link></section> :
    <form onSubmit={submit} className="space-y-4">
      {enabled&&verified&&<p>التحقق بخطوتين مفعّل. يمكنك العودة إلى لوحة الإدارة.</p>}
      {!enabled&&!secret ? <label className="block">أكّد كلمة المرور لإعداد المصادقة<input className="mt-2 w-full rounded-xl border p-3" name="password" type="password" autoComplete="current-password" required /></label> : <>
        {secret&&<><p>أضف حسابًا يدويًا في تطبيق المصادقة باسم Nursing AI باستخدام هذا المفتاح:</p><code dir="ltr" className="block break-all rounded-xl border p-3">{secret}</code></>}
        <label className="block">رمز المصادقة أو رمز الاسترداد<input className="mt-2 w-full rounded-xl border p-3" name="code" autoComplete="one-time-code" maxLength={32} dir="ltr" required /></label></>}
      <button disabled={busy} className="min-h-12 rounded-xl bg-primary px-6 text-primary-foreground">{busy?"جارٍ التحقق…":secret?"تفعيل وحفظ رموز الاسترداد":enabled?"تحقق":"إعداد التحقق بخطوتين"}</button>
    </form>}
    <Link href="/support" className="block text-primary underline">مساعدة في الوصول إلى الحساب</Link>
  </main>;
}
