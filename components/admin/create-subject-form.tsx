"use client";

import { useActionState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createSubjectAction, type SubjectActionState } from "@/app/admin/actions";

const initialState: SubjectActionState = {};

export function CreateSubjectForm() {
  const [state, formAction, isPending] = useActionState(createSubjectAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="nameAr">الاسم بالعربية</Label>
          <Input id="nameAr" name="nameAr" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nameEn">الاسم بالإنجليزية</Label>
          <Input id="nameEn" name="nameEn" dir="ltr" required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">الوصف (اختياري)</Label>
        <Textarea id="description" name="description" rows={2} />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">{state.success}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "جارٍ الإضافة..." : "إضافة مادة"}
      </Button>
    </form>
  );
}
