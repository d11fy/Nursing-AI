"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type AuthActionState } from "@/app/(auth)/actions";

const initialState: AuthActionState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "";

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">تسجيل الدخول</h1>
      <p className="mt-1 text-sm text-slate-500">
        أهلًا بعودتك، سجّل الدخول لمتابعة دراستك
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <div className="space-y-1.5">
          <Label htmlFor="email">البريد الإلكتروني</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required dir="ltr" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">كلمة المرور</Label>
            <Link href="/forgot-password" className="text-xs text-blue-600 hover:underline">
              نسيت كلمة المرور؟
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        {state.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
            {state.error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "جارٍ الدخول..." : "تسجيل الدخول"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        ليس لديك حساب؟{" "}
        <Link href="/register" className="font-medium text-blue-600 hover:underline">
          إنشاء حساب جديد
        </Link>
      </p>
    </div>
  );
}
