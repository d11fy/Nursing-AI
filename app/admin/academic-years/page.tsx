import { createAcademicYearAction, updateAcademicYearAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAcademicYears } from "@/lib/subjects";

export default async function AcademicYearsPage() {
  const years = await getAcademicYears(true);
  return <div className="page-container mx-auto max-w-5xl space-y-6">
    <div><h1 className="text-xl font-bold">السنوات الدراسية</h1><p className="text-sm text-muted-foreground">يمكن تعديل الاسم والترتيب أو تعطيل السنة. السنوات المرتبطة بطلاب لا تُحذف.</p></div>
    <form action={createAcademicYearAction} className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-4">
      <Input name="nameAr" placeholder="اسم المستوى بالعربية" required /><Input name="nameEn" dir="ltr" placeholder="English name" required /><Input name="code" dir="ltr" pattern="[a-z0-9_]+" placeholder="level_code" required /><div className="flex gap-2"><Input name="sortOrder" type="number" min={0} defaultValue={years.length + 1} required /><Button>إضافة</Button></div>
    </form>
    <div className="overflow-hidden rounded-xl border border-border bg-card"><Table><TableHeader><TableRow><TableHead>الاسم العربي</TableHead><TableHead>English</TableHead><TableHead>Code</TableHead><TableHead>الترتيب</TableHead><TableHead>الحالة</TableHead><TableHead /></TableRow></TableHeader>
      <TableBody>{years.map(year => <TableRow key={year.id}><TableCell colSpan={6} className="p-0"><form action={updateAcademicYearAction} className="grid grid-cols-[1fr_1fr_130px_90px_110px_auto] items-center gap-2 p-2">
        <input type="hidden" name="id" value={year.id} /><Input name="nameAr" defaultValue={year.name_ar} required /><Input name="nameEn" dir="ltr" defaultValue={year.name_en} required /><span dir="ltr" className="text-sm text-muted-foreground">{year.code}</span><Input name="sortOrder" type="number" min={0} defaultValue={year.sort_order} required /><select name="isActive" defaultValue={String(year.is_active)} className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm"><option value="true">Active</option><option value="false">Disabled</option></select><Button size="sm">حفظ</Button>
      </form></TableCell></TableRow>)}</TableBody></Table></div>
  </div>;
}
