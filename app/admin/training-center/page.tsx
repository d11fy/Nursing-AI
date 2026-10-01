import { requireAdminProfile } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import { calculateSubjectReadiness, type SubjectReadinessMetrics } from "@/lib/exams/analytics-service";
import { TrainingCenterView } from "@/components/admin/training-center-view";

export const metadata = {
  title: "مركز التدريب وجاهزية المواد | لوحة الإدارة",
  description: "مركز تحليل الجاهزية الأكاديمية وبنوك الأسئلة والامتحانات السابقة لمواد التمريض",
};

export default async function AdminTrainingCenterPage() {
  await requireAdminProfile();
  const pool = getPool();

  // Fetch all active subjects
  const { rows: subjects } = await pool.query<{ id: string }>(
    `SELECT id FROM public.subjects WHERE status = 'active' ORDER BY sort_order, name_ar`
  );

  const metrics: SubjectReadinessMetrics[] = [];
  for (const s of subjects) {
    const m = await calculateSubjectReadiness(s.id);
    metrics.push(m);
  }

  return (
    <div className="page-container mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Exam Training Center — مركز التدريب والجاهزية
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            متابعة دقيقة لجاهزية المساقات، نسب التغطية الأكاديمية الفعلية، والبحث الموحد عبر كل المصادر المعتمدة.
          </p>
        </div>
      </div>

      <TrainingCenterView subjects={metrics} />
    </div>
  );
}
