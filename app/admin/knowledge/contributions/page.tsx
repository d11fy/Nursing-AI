import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ContributionActions } from "@/components/admin/contribution-actions";
import { getAdminContributions } from "@/lib/lectures/admin";

const CLASSIFICATION_LABEL: Record<string, string> = {
  nursing_related: "متعلق بالتمريض",
  not_nursing: "غير متعلق",
  uncertain: "غير مؤكد",
};

function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function AdminContributionsPage() {
  const contributions = await getAdminContributions("pending");

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">مراجعة المساهمات</h1>
        <p className="text-sm text-muted-foreground">
          محاضرات وافق أصحابها على المساهمة بها في قاعدة المعرفة المشتركة، بانتظار المراجعة.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>اسم الملف</TableHead>
              <TableHead>المادة</TableHead>
              <TableHead>النوع</TableHead>
              <TableHead>الحجم</TableHead>
              <TableHead>الطالب</TableHead>
              <TableHead>التصنيف</TableHead>
              <TableHead>الثقة</TableHead>
              <TableHead>تاريخ الرفع</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {contributions.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.lecture_title}</TableCell>
                <TableCell>{c.subject_name ?? "—"}</TableCell>
                <TableCell dir="ltr" className="text-left text-xs text-muted-foreground">{c.file_name}</TableCell>
                <TableCell>{formatSize(c.file_size_bytes)}</TableCell>
                <TableCell>
                  <div>{c.student_name}</div>
                  <div dir="ltr" className="text-xs text-muted-foreground">{c.student_email}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge variant={c.classification === "nursing_related" ? "secondary" : "outline"}>
                      {CLASSIFICATION_LABEL[c.classification] ?? c.classification}
                    </Badge>
                    {c.privacy_flagged && <Badge variant="destructive">يحتاج مراجعة خصوصية</Badge>}
                  </div>
                </TableCell>
                <TableCell>{c.classification_confidence !== null ? `${Math.round(c.classification_confidence * 100)}%` : "—"}</TableCell>
                <TableCell>{new Date(c.created_at).toLocaleDateString("ar-EG")}</TableCell>
                <TableCell><ContributionActions contributionId={c.id} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {contributions.length === 0 && <div className="py-16 text-center text-slate-400">لا توجد مساهمات بانتظار المراجعة</div>}
      </div>
    </div>
  );
}
