"use client";

import { useActionState, useEffect, useRef } from "react";
import { createSubjectAction, type SubjectActionState } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AcademicYear } from "@/lib/subjects";

const initialState: SubjectActionState = {};

export function SubjectFields({ years, defaults }: { years: AcademicYear[]; defaults?: {
  name_ar: string; name_en: string; description_ar: string | null; description_en: string | null;
  icon: string; icon_theme: string | null; status: string; sort_order: number; academicYearIds: string[];
} }) {
  return <>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor="nameAr">الاسم بالعربية</Label><Input id="nameAr" name="nameAr" defaultValue={defaults?.name_ar} required /></div>
      <div className="space-y-1.5"><Label htmlFor="nameEn">الاسم بالإنجليزية</Label><Input id="nameEn" name="nameEn" dir="ltr" defaultValue={defaults?.name_en} required /></div>
      <div className="space-y-1.5"><Label htmlFor="descriptionAr">الوصف بالعربية</Label><Textarea id="descriptionAr" name="descriptionAr" defaultValue={defaults?.description_ar ?? ""} rows={2} /></div>
      <div className="space-y-1.5"><Label htmlFor="descriptionEn">الوصف بالإنجليزية (اختياري)</Label><Textarea id="descriptionEn" name="descriptionEn" dir="ltr" defaultValue={defaults?.description_en ?? ""} rows={2} /></div>
      <div className="space-y-1.5"><Label htmlFor="icon">الأيقونة</Label><Input id="icon" name="icon" defaultValue={defaults?.icon ?? "book-open"} /></div>
      <div className="space-y-1.5"><Label htmlFor="iconTheme">لون / Theme (اختياري)</Label><Input id="iconTheme" name="iconTheme" defaultValue={defaults?.icon_theme ?? ""} placeholder="blue" /></div>
      <div className="space-y-1.5"><Label htmlFor="sortOrder">ترتيب الظهور</Label><Input id="sortOrder" name="sortOrder" type="number" min={0} defaultValue={defaults?.sort_order ?? 0} required /></div>
      <div className="space-y-1.5"><Label htmlFor="status">الحالة</Label><select id="status" name="status" defaultValue={defaults?.status ?? "active"} className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"><option value="active">Active</option><option value="inactive">Hidden</option></select></div>
    </div>
    <fieldset className="space-y-2 rounded-xl border border-border p-3">
      <legend className="px-1 text-sm font-medium">السنة الدراسية (اختر واحدة أو أكثر)</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {years.map((year) => <label key={year.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="academicYearIds" value={year.id} defaultChecked={defaults?.academicYearIds.includes(year.id)} /> {year.name_ar}
        </label>)}
      </div>
    </fieldset>
  </>;
}

export function CreateSubjectForm({ years }: { years: AcademicYear[] }) {
  const [state, formAction, isPending] = useActionState(createSubjectAction, initialState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.success) ref.current?.reset(); }, [state.success]);
  return <form ref={ref} action={formAction} className="space-y-4">
    <SubjectFields years={years} />
    {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    {state.success && <p className="text-sm text-green-700">{state.success}</p>}
    <Button type="submit" disabled={isPending}>{isPending ? "جارٍ الإضافة..." : "إضافة مادة"}</Button>
  </form>;
}
