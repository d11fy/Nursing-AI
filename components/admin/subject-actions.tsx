"use client";

import { useActionState, useState } from "react";
import { Pencil, Archive } from "lucide-react";
import { archiveSubjectAction, updateSubjectAction, type SubjectActionState } from "@/app/admin/actions";
import { SubjectFields } from "./create-subject-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { AcademicYear, SubjectWithYears } from "@/lib/subjects";

export function SubjectActions({ subject, years }: { subject: SubjectWithYears; years: AcademicYear[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: SubjectActionState, data: FormData) => {
    const result = await updateSubjectAction(prev, data); if (result.success) setOpen(false); return result;
  }, {});
  return <div className="flex gap-1">
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="تعديل المادة"><Pencil className="size-4" /></Button>} />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>تعديل المادة</DialogTitle></DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="subjectId" value={subject.id} />
          <SubjectFields years={years} defaults={{ ...subject, academicYearIds: subject.academic_years.map(y => y.id) }} />
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <DialogFooter><Button type="submit" disabled={pending}>{pending ? "جارٍ الحفظ..." : "حفظ"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="أرشفة المادة"><Archive className="size-4 text-red-600" /></Button>} />
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>أرشفة المادة؟</AlertDialogTitle><AlertDialogDescription>سيتم إخفاء المادة مع الحفاظ على المحادثات والملفات المرتبطة بها.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><form action={archiveSubjectAction}><input type="hidden" name="subjectId" value={subject.id} /><AlertDialogAction type="submit" variant="destructive">أرشفة</AlertDialogAction></form></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
