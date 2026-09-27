import { createClient } from "@/lib/db/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateSubjectForm } from "@/components/admin/create-subject-form";
import { SubjectStatusToggle } from "@/components/admin/subject-status-toggle";

export default async function AdminSubjectsPage() {
  const db = await createClient();
  const { data: subjects } = await db
    .from("subjects")
    .select("id, name_ar, name_en, description, status")
    .order("created_at", { ascending: true });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">المواد الدراسية</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">إضافة مادة جديدة</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateSubjectForm />
        </CardContent>
      </Card>

      <div className="space-y-2">
        {(subjects ?? []).map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
          >
            <div>
              <p className="font-medium text-slate-900 dark:text-white">{s.name_ar}</p>
              <p dir="ltr" className="text-left text-sm text-slate-500">{s.name_en}</p>
            </div>
            <SubjectStatusToggle id={s.id} status={s.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
