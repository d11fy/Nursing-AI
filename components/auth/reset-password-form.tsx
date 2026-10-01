"use client";
import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction, type AuthActionState } from "@/app/(auth)/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, {} as AuthActionState);
  return <form action={action} className="space-y-4">
    <div className="mb-5">
      <p className="eyebrow mb-1">أمان الحساب</p>
      <h1 className="text-2xl font-extrabold tracking-tight text-foreground">كلمة مرور جديدة</h1>
      <p className="mt-1.5 text-sm leading-7 text-muted-foreground">اختر كلمة مرور قوية لا تقل عن ثمانية أحرف.</p>
    </div>
    <input type="hidden" name="token" value={token} />
    <label htmlFor="new-password">كلمة المرور الجديدة</label>
    <Input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
    {state.error && <p role="alert" className="rounded-xl border border-destructive/15 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">{state.error}</p>}
    {state.success ? <><p role="status" className="rounded-xl border border-success/15 bg-success/10 px-3.5 py-3 text-sm text-success">{state.success}</p><Link href="/login" className="font-semibold text-primary hover:underline">تسجيل الدخول</Link></> : <Button className="w-full" disabled={pending} type="submit">{pending ? "جارٍ الحفظ..." : "تغيير كلمة المرور"}</Button>}
  </form>;
}
