import Link from "next/link";
import { FileText, Loader2, TriangleAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { daysUntil } from "@/lib/lectures/retention-display";
import type { LectureStatus } from "@/types/database";

const STATUS_LABEL: Record<LectureStatus, string> = {
  uploading: "جارٍ الرفع",
  uploaded: "جارٍ التجهيز",
  processing: "جاري تجهيزها للدراسة...",
  ready: "جاهزة للدراسة",
  failed: "تعذر تجهيز المحاضرة",
  expired: "منتهية",
  deleted: "محذوفة",
};

function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LectureCard({
  subjectId,
  lecture,
}: {
  subjectId: string;
  lecture: {
    id: string;
    title: string;
    file_name: string;
    status: LectureStatus;
    file_size_bytes: number;
    delete_after: string | null;
    deleted_at: string | null;
  };
}) {
  const isBusy = lecture.status === "uploading" || lecture.status === "uploaded" || lecture.status === "processing";
  const daysLeft = lecture.delete_after && !lecture.deleted_at ? daysUntil(lecture.delete_after) : null;

  return (
    <Link href={`/dashboard/subjects/${subjectId}/lectures/${lecture.id}`}>
      <Card className="interactive-card">
        <CardContent className="flex items-start gap-3 p-4">
          <div className="icon-tile size-10 shrink-0 rounded-xl">
            <FileText className="size-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="truncate font-medium text-foreground">{lecture.title}</p>
            <p className="text-xs text-muted-foreground">{formatSize(lecture.file_size_bytes)}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={lecture.status}>
                {isBusy && <Loader2 className="size-3 animate-spin" />}
                {STATUS_LABEL[lecture.status]}
              </StatusBadge>
              {daysLeft !== null && (
                <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400">
                  <TriangleAlert className="size-3" /> سيتم حذف الملف الأصلي بعد {daysLeft} {daysLeft === 1 ? "يوم" : "أيام"}
                </Badge>
              )}
              {lecture.deleted_at && (
                <Badge variant="outline" className="text-muted-foreground">الملف الأصلي محذوف</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
