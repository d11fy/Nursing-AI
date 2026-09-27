import { createClient } from "@/lib/supabase/server";
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
import { nursingYearOptions } from "@/lib/validations/auth";

export default async function AdminStudentsPage() {
  const supabase = await createClient();
  const { data: students } = await supabase.rpc("admin_list_students");

  const yearLabel = (value: string) =>
    nursingYearOptions.find((o) => o.value === value)?.label ?? value;

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
                <TableCell>{yearLabel(s.nursing_year)}</TableCell>
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

        {(!students || students.length === 0) && (
          <div className="py-16 text-center text-slate-400">لا يوجد طلاب مسجلون بعد</div>
        )}
      </div>
    </div>
  );
}
