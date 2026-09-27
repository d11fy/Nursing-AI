import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StudentActions } from "@/components/admin/student-actions";
import { getAcademicYears, getAdminStudents } from "@/lib/subjects";
import { setStudentAcademicYearAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

export default async function AdminStudentsPage() {
  const [students, years] = await Promise.all([getAdminStudents(), getAcademicYears(false)]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">الطلاب</h1>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الاسم</TableHead>
              <TableHead>الإيميل</TableHead>
              <TableHead>الجامعة</TableHead>
              <TableHead>السنة</TableHead>
              <TableHead>تاريخ التسجيل</TableHead>
              <TableHead>عدد الأسئلة</TableHead>
              <TableHead>آخر نشاط</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(students ?? []).map((s) => (
              <TableRow key={s.user_id}>
                <TableCell className="font-medium">{s.full_name}</TableCell>
                <TableCell dir="ltr" className="text-left text-slate-500">{s.email}</TableCell>
                <TableCell>{s.university ?? "—"}</TableCell>
                <TableCell><form action={setStudentAcademicYearAction} className="flex min-w-56 items-center gap-2">
                  <input type="hidden" name="userId" value={s.user_id} />
                  <select name="academicYearId" defaultValue={s.academic_year_id ?? ""} className="h-8 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm" required>
                    <option value="" disabled>اختر السنة</option>{years.map(year => <option key={year.id} value={year.id}>{year.name_ar}</option>)}
                  </select><Button size="sm" variant="outline">حفظ</Button>
                </form></TableCell>
                <TableCell>{new Date(s.created_at).toLocaleDateString("ar-EG")}</TableCell>
                <TableCell>{s.questions_count}</TableCell>
                <TableCell>
                  {s.last_activity ? new Date(s.last_activity).toLocaleDateString("ar-EG") : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={s.status === "active" ? "secondary" : "destructive"}>
                    {s.status === "active" ? "نشط" : "معلق"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <StudentActions userId={s.user_id} status={s.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {students.length === 0 && (
          <div className="py-16 text-center text-slate-400">لا يوجد طلاب مسجلون بعد</div>
        )}
      </div>
    </div>
  );
}
