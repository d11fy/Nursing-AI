"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { nursingYearOptions } from "@/lib/validations/auth";
import { completeGoogleRegistrationAction, type AuthActionState } from "@/app/(auth)/actions";

const initialState: AuthActionState = {};

export function GoogleCompleteForm({ name, email }: { name: string; email: string }) {
  const [state, action, pending] = useActionState(completeGoogleRegistrationAction, initialState);
  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">أكمل بيانات حسابك</h1>
      <p className="mt-1 text-sm text-slate-500">مرحبًا {name}، بقي تحديد بياناتك الدراسية فقط.</p>
      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800" dir="ltr">{email}</p>
      <form action={action} className="mt-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="university">الجامعة</Label>
          <Input id="university" name="university" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nursingYear">السنة الدراسية</Label>
          <Select name="nursingYear" defaultValue="year1">
            <SelectTrigger id="nursingYear" className="w-full">
              <SelectValue>{(value: string) => nursingYearOptions.find((option) => option.value === value)?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {nursingYearOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">{state.error}</p>}
        <Button type="submit" className="w-full" disabled={pending}>{pending ? "جارٍ إنشاء الحساب..." : "إكمال وإنشاء الحساب"}</Button>
      </form>
    </div>
  );
}
