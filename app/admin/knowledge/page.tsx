import { createClient } from "@/lib/db/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UploadDocumentDialog } from "@/components/admin/upload-document-dialog";
import { DocumentRowActions } from "@/components/admin/document-row-actions";
import type { DocumentStatus } from "@/types/database";

const STATUS_LABEL: Record<DocumentStatus, string> = {
  uploading: "جارٍ الرفع",
  processing: "جارٍ المعالجة",
  ready: "جاهز",
  failed: "فشل",
};

const STATUS_VARIANT: Record<DocumentStatus, "secondary" | "outline" | "destructive"> = {
  uploading: "outline",
  processing: "outline",
  ready: "secondary",
  failed: "destructive",
};

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export default async function AdminKnowledgePage() {
  const db = await createClient();

  const [{ data: documents }, { data: subjects }, { data: allSubjects }] = await Promise.all([
    db
      .from("documents")
      .select("id, title, file_name, file_size, chunk_count, status, created_at, subject_id, extraction_page_count, ocr_page_count, index_version, error_message")
      .order("created_at", { ascending: false }),
    db.from("subjects").select("id, name_ar").eq("status", "active"),
    db.from("subjects").select("id, name_ar"),
  ]);

  const subjectNameById = new Map((allSubjects ?? []).map((s) => [s.id, s.name_ar]));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">قاعدة المعرفة</h1>
        <UploadDocumentDialog subjects={subjects ?? []} />
      </div>

      <p className="rounded-xl border border-border bg-card p-4 text-sm">
        يبحث المساعد تلقائيًا في الملفات الجاهزة، ويذكر اسم المصدر والصفحة.
        اختر «إعادة المعالجة» للملفات القديمة لإعادة قراءة الصفحات المصورة وتحسين تقسيم النص.
        القراءة البصرية قد تخطئ في النصوص غير الواضحة؛ راجع جودة النسخة الأصلية.
      </p>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>اسم الملف</TableHead>
              <TableHead>المادة</TableHead>
              <TableHead>الحجم</TableHead>
              <TableHead>عدد المقاطع</TableHead>
              <TableHead>قراءة المحتوى</TableHead>
              <TableHead>تاريخ الرفع</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(documents ?? []).map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.title}</TableCell>
                <TableCell>{subjectNameById.get(d.subject_id ?? "") ?? "—"}</TableCell>
                <TableCell>{formatSize(d.file_size)}</TableCell>
                <TableCell>{d.chunk_count}</TableCell>
                <TableCell className="text-xs">
                  {d.extraction_page_count != null ? `${d.extraction_page_count} صفحة · ${d.ocr_page_count} قراءة بصرية` : "لم تُقَسّ تغطية الصفحات بعد"}
                  {d.index_version < 2 && <p className="text-amber-700">إعادة المعالجة تحسّن قراءة الملف</p>}
                  {d.error_message && <p className="max-w-xs text-red-600">{d.error_message}</p>}
                </TableCell>
                <TableCell>{new Date(d.created_at).toLocaleDateString("ar-EG")}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[d.status]}>{STATUS_LABEL[d.status]}</Badge>
                </TableCell>
                <TableCell>
                  <DocumentRowActions documentId={d.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {(!documents || documents.length === 0) && (
          <div className="py-16 text-center text-slate-400">لا توجد ملفات بعد</div>
        )}
      </div>
    </div>
  );
}
