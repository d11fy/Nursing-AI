import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAdminLectures, getLectureStorageStats } from "@/lib/lectures/admin";
import { getAcademicYears, getAdminSubjects } from "@/lib/subjects";
import type { LectureStatus, LectureContributionStatus } from "@/types/database";

const STATUS_LABEL: Record<LectureStatus, string> = {
  uploading: "جارٍ الرفع",
  uploaded: "جارٍ التجهيز",
  processing: "جارٍ المعالجة",
  ready: "جاهزة",
  failed: "فشلت",
  expired: "منتهية",
  deleted: "محذوفة",
};

const CONTRIBUTION_LABEL: Record<LectureContributionStatus, string> = {
  not_submitted: "لم تُقدَّم",
  pending: "قيد المراجعة",
  approved: "مقبولة",
  rejected: "مرفوضة",
};

function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function formatBytes(bytes: number) {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default async function AdminLecturesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

  const filters = {
    subjectId: one(params.subjectId),
    academicYearId: one(params.academicYearId),
    status: one(params.status) as LectureStatus | undefined,
    largeOnly: one(params.largeOnly) === "1",
    expiringSoon: one(params.expiringSoon) === "1",
    contributionStatus: one(params.contributionStatus) as LectureContributionStatus | undefined,
  };

  const [lectures, stats, subjects, years] = await Promise.all([
    getAdminLectures(filters),
    getLectureStorageStats(),
    getAdminSubjects(),
    getAcademicYears(true),
  ]);

  return (
    <div className="page-container mx-auto max-w-6xl space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">محاضرات الطلاب</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="إجمالي التخزين" value={formatBytes(stats.totalStorageBytes)} />
        <StatCard label="ملفات كبيرة (>20MB)" value={String(stats.largeFileCount)} />
        <StatCard label="ستُحذف قريبًا" value={String(stats.scheduledForDeletionCount)} />
        <StatCard label="حُذفت هذا الشهر" value={String(stats.deletedThisMonthCount)} />
        <StatCard label="فشل في المعالجة" value={String(stats.processingFailuresCount)} />
      </div>

      <form className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        <select name="subjectId" defaultValue={filters.subjectId ?? ""} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
          <option value="">كل المواد</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
        </select>
        <select name="academicYearId" defaultValue={filters.academicYearId ?? ""} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
          <option value="">كل السنوات</option>
          {years.map((y) => <option key={y.id} value={y.id}>{y.name_ar}</option>)}
        </select>
        <select name="status" defaultValue={filters.status ?? ""} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
          <option value="">كل الحالات</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select name="contributionStatus" defaultValue={filters.contributionStatus ?? ""} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
          <option value="">كل حالات المساهمة</option>
          {Object.entries(CONTRIBUTION_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="largeOnly" value="1" defaultChecked={filters.largeOnly} /> ملفات كبيرة فقط
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="expiringSoon" value="1" defaultChecked={filters.expiringSoon} /> ستُحذف قريبًا
        </label>
        <Button type="submit" size="sm" variant="outline">تصفية</Button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>المحاضرة</TableHead>
              <TableHead>الطالب</TableHead>
              <TableHead>المادة</TableHead>
              <TableHead>الحجم</TableHead>
              <TableHead>تاريخ الرفع</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>الحذف</TableHead>
              <TableHead>المساهمة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lectures.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.title}</TableCell>
                <TableCell>
                  <div>{l.student_name}</div>
                  <div dir="ltr" className="text-xs text-muted-foreground">{l.student_email}</div>
                </TableCell>
                <TableCell>{l.subject_name}</TableCell>
                <TableCell>{formatSize(l.file_size_bytes)}</TableCell>
                <TableCell>{new Date(l.uploaded_at).toLocaleDateString("ar-EG")}</TableCell>
                <TableCell><Badge variant={l.status === "ready" ? "secondary" : l.status === "failed" ? "destructive" : "outline"}>{STATUS_LABEL[l.status]}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {l.deleted_at ? "محذوف" : l.delete_after ? new Date(l.delete_after).toLocaleDateString("ar-EG") : "—"}
                </TableCell>
                <TableCell><Badge variant="outline">{CONTRIBUTION_LABEL[l.contribution_status]}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {lectures.length === 0 && <div className="py-16 text-center text-slate-400">لا توجد محاضرات مطابقة</div>}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}
