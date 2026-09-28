import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateSubjectForm } from "@/components/admin/create-subject-form";
import { SubjectActions } from "@/components/admin/subject-actions";
import { getAcademicYears, getAdminSubjects } from "@/lib/subjects";

export default async function AdminSubjectsPage({ searchParams }: PageProps<"/admin/subjects">) {
  const params = await searchParams;
  const year = typeof params.year === "string" ? params.year : "";
  const status = typeof params.status === "string" ? params.status : "";
  const search = typeof params.search === "string" ? params.search : "";
  const [years, subjects] = await Promise.all([
    getAcademicYears(true), getAdminSubjects({ academicYearId: year || undefined, status, search }),
  ]);
  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-bold">إدارة المواد الدراسية</h1><p className="text-sm text-muted-foreground">إضافة المواد وربطها بسنة أو أكثر</p></div>
      <Button nativeButton={false} render={<a href="/admin/academic-years">إدارة السنوات الدراسية</a>} variant="outline" />
    </div>
    <Card><CardHeader><CardTitle className="text-base">إضافة مادة جديدة</CardTitle></CardHeader><CardContent><CreateSubjectForm years={years.filter(y => y.is_active)} /></CardContent></Card>
    <form className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[1fr_220px_180px_auto]">
      <div className="relative"><Search className="absolute right-3 top-2.5 size-4 text-muted-foreground" /><Input name="search" defaultValue={search} className="pr-9" placeholder="بحث بالعربي أو English" /></div>
      <select name="year" defaultValue={year} className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm"><option value="">كل السنوات</option>{years.map(y => <option key={y.id} value={y.id}>{y.name_ar}</option>)}</select>
      <select name="status" defaultValue={status} className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm"><option value="">كل الحالات</option><option value="active">Active</option><option value="inactive">Hidden</option></select>
      <Button type="submit">تصفية</Button>
    </form>
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table><TableHeader><TableRow><TableHead>المادة</TableHead><TableHead>English</TableHead><TableHead>السنة / السنوات</TableHead><TableHead>المحاضرات</TableHead><TableHead>الطلاب</TableHead><TableHead>الحالة</TableHead><TableHead>الترتيب</TableHead><TableHead /></TableRow></TableHeader>
      <TableBody>{subjects.map(subject => <TableRow key={subject.id}>
        <TableCell className="font-medium">
          <div className="flex items-center gap-2">
            <span>{subject.name_ar}</span>
            {subject.course_code && <Badge variant="outline" className="font-mono text-xs">{subject.course_code}</Badge>}
            {subject.course_type && <Badge variant="secondary" className="text-xs">{subject.course_type}</Badge>}
          </div>
        </TableCell>
        <TableCell dir="ltr">{subject.name_en}</TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1 items-center">
            {subject.academic_years.map(y => <Badge key={y.id} variant="outline">{y.name_ar}</Badge>)}
            {subject.semester && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                {subject.semester === 1 ? "الفصل 1" : "الفصل 2"}
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell>{subject.lecture_count ?? 0}</TableCell><TableCell>{subject.student_count ?? 0}</TableCell>
        <TableCell><Badge variant={subject.status === "active" ? "secondary" : "outline"}>{subject.status === "active" ? "Active" : "Hidden"}</Badge></TableCell>
        <TableCell>{subject.sort_order}</TableCell><TableCell><SubjectActions subject={subject} years={years.filter(y => y.is_active)} /></TableCell>
      </TableRow>)}</TableBody></Table>
      {!subjects.length && <div className="py-12 text-center text-muted-foreground">لا توجد مواد مطابقة</div>}
    </div>
  </div>;
}
