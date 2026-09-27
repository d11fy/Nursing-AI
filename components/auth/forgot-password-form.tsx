"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction, type AuthActionState } from "@/app/(auth)/actions";

const initialState: AuthActionState = {};

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(forgotPasswordAction, initialState);

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">استعادة كلمة المرور</h1>
      <p className="mt-1 text-sm text-slate-500">
        أدخل بريدك الإلكتروني وسنرسل لك رابطًا لإعادة تعيين كلمة المرور
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">البريد الإلكتروني</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required dir="ltr" />
        </div>

        {state.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
            {state.error}
          </p>
        )}

        {state.success && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/40">
            {state.success}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "جارٍ الإرسال..." : "إرسال رابط إعادة التعيين"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        تذكرت كلمة المرور؟{" "}
        <Link href="/login" className="font-medium text-blue-600 hover:underline">
          تسجيل الدخول
        </Link>
      </p>
    </div>
  );
}
