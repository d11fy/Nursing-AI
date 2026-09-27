import Link from "next/link";
import { BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function SubjectsPage() {
  const supabase = await createClient();
  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name_ar, name_en, description")
    .eq("status", "active")
    .order("name_ar", { ascending: true });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">المواد الدراسية</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        {(subjects ?? []).map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                <BookOpen className="size-5" />
              </div>
              <CardTitle className="text-base">{s.name_ar}</CardTitle>
              <CardDescription dir="ltr" className="text-left">{s.name_en}</CardDescription>
            </CardHeader>
            <CardContent>
              {s.description && <p className="mb-4 text-sm text-slate-500">{s.description}</p>}
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href={`/dashboard/chat?subject=${s.id}`}>ابدأ محادثة عن هذه المادة</Link>}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      {(!subjects || subjects.length === 0) && (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-slate-400">
          لا توجد مواد بعد
        </div>
      )}
    </div>
  );
}
