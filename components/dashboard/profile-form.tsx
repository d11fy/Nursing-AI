"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileAction, type ProfileActionState } from "@/app/dashboard/actions";
import type { Profile } from "@/types/database";

const initialState: ProfileActionState = {};

export function ProfileForm({ profile, academicYearName }: { profile: Profile; academicYearName: string | null }) {
  const [state, formAction, isPending] = useActionState(updateProfileAction, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <fieldset className="space-y-4">
        <legend className="mb-4 text-sm font-bold text-foreground">بياناتك الشخصية</legend>
      <div className="space-y-1.5">
        <Label htmlFor="email">البريد الإلكتروني</Label>
        <Input id="email" value={profile.email} disabled dir="ltr" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fullName">الاسم الكامل</Label>
        <Input id="fullName" name="fullName" defaultValue={profile.full_name} required />
      </div>

      </fieldset>
      <fieldset className="space-y-4 border-t border-border pt-6">
        <legend className="px-1 text-sm font-bold text-foreground">المعلومات الدراسية</legend>
      <div className="space-y-1.5">
        <Label htmlFor="university">الجامعة</Label>
        <Input id="university" name="university" defaultValue={profile.university ?? ""} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nursingYear">السنة الدراسية</Label>
        <Input id="nursingYear" value={academicYearName ?? "غير محددة"} disabled />
        <p className="text-xs text-muted-foreground">يمكن للإدارة تعديل السنة الدراسية من لوحة الطلاب.</p>
      </div>

      </fieldset>

      {state.error && (
        <p role="alert" className="rounded-xl border border-destructive/15 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="rounded-xl border border-success/15 bg-success/10 px-3.5 py-3 text-sm text-success">
          {state.success}
        </p>
      )}

      <Button type="submit" className="min-w-36" disabled={isPending}>
        {isPending ? "جارٍ الحفظ..." : "حفظ التعديلات"}
      </Button>
    </form>
  );
}
