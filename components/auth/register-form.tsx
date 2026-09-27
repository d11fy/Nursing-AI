"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { nursingYearOptions } from "@/lib/validations/auth";
import { registerAction, type AuthActionState } from "@/app/(auth)/actions";

const initialState: AuthActionState = {};

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(registerAction, initialState);

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">إنشاء حساب جديد</h1>
      <p className="mt-1 text-sm text-slate-500">انضم لمنصة Nursing AI وابدأ رحلتك الدراسية</p>

      <form action={formAction} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">الاسم الكامل</Label>
          <Input id="fullName" name="fullName" required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">البريد الإلكتروني</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required dir="ltr" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">كلمة المرور</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="university">الجامعة</Label>
          <Input id="university" name="university" required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="nursingYear">السنة الدراسية</Label>
          <Select name="nursingYear" defaultValue="year1">
            <SelectTrigger id="nursingYear" className="w-full">
              <SelectValue>
                {(value: string) => nursingYearOptions.find((o) => o.value === value)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {nursingYearOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {state.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
            {state.error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "جارٍ إنشاء الحساب..." : "إنشاء الحساب"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        لديك حساب بالفعل؟{" "}
        <Link href="/login" className="font-medium text-blue-600 hover:underline">
          تسجيل الدخول
        </Link>
      </p>
    </div>
  );
}
