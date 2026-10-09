"use client";
import { useActionState } from 'react';
import { testSmtpAction } from '@/app/admin/subscriptions/actions';
export function SmtpTestForm(){
  const [result,action,pending]=useActionState(testSmtpAction,{} as {error?:string;accepted?:boolean;messageId?:string;connected?:boolean});
  return <form action={action} className="mt-5 flex flex-wrap items-center gap-2 border-t pt-5"><input className="min-h-11 max-w-sm rounded-xl border p-3" name="email" type="email" placeholder="بريد الاختبار" required/><button type="submit" className="min-h-11 rounded-xl border px-4" disabled={pending}>{pending?'جارٍ الاختبار…':'إرسال رسالة اختبار'}</button>
    {result.error&&<p role="alert" className="w-full text-sm text-red-600">{result.error}</p>}
    {result.connected&&<p role="status" className="w-full text-sm">SMTP connected: نعم — message accepted: {result.accepted?'نعم':'لا'} — Message-ID: <bdi dir="ltr">{result.messageId}</bdi></p>}
  </form>;
}
