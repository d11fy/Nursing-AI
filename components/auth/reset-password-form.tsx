"use client";
import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction, type AuthActionState } from "@/app/(auth)/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, {} as AuthActionState);
  return <form action={action} className="space-y-4">
    <input type="hidden" name="token" value={token} />
    <label htmlFor="new-password">كلمة المرور الجديدة</label>
    <Input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
    {state.error && <p role="alert">{state.error}</p>}
    {state.success ? <><p role="status">{state.success}</p><Link href="/login">تسجيل الدخول</Link></> : <Button disabled={pending} type="submit">{pending ? "جارٍ الحفظ..." : "تغيير كلمة المرور"}</Button>}
  </form>;
}
