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
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">البريد الإلكتروني</Label>
        <Input id="email" value={profile.email} disabled dir="ltr" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fullName">الاسم الكامل</Label>
        <Input id="fullName" name="fullName" defaultValue={profile.full_name} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="university">الجامعة</Label>
        <Input id="university" name="university" defaultValue={profile.university ?? ""} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nursingYear">السنة الدراسية</Label>
        <Input id="nursingYear" value={academicYearName ?? "غير محددة"} disabled />
        <p className="text-xs text-muted-foreground">يمكن للإدارة تعديل السنة الدراسية من لوحة الطلاب.</p>
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

      <Button type="submit" disabled={isPending}>
        {isPending ? "جارٍ الحفظ..." : "حفظ التعديلات"}
      </Button>
    </form>
  );
}
