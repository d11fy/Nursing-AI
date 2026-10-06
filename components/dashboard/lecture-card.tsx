import Link from "next/link";
import { BookOpen, FileText, Loader2, TriangleAlert, ArrowLeft } from "lucide-react";
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
  const isReady = lecture.status === "ready" || lecture.status === "expired";
  const daysLeft = lecture.delete_after && !lecture.deleted_at ? daysUntil(lecture.delete_after) : null;

  return (
    <Link href={`/dashboard/subjects/${subjectId}/lectures/${lecture.id}`}>
      <Card className="interactive-card hover:border-primary/50 transition-colors">
        <CardContent className="flex items-start gap-3 p-4">
          <div className="icon-tile size-10 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            {isReady ? <BookOpen className="size-5" /> : <FileText className="size-5" />}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex min-w-0 flex-col items-start gap-2 min-[430px]:flex-row min-[430px]:justify-between">
              <p dir="auto" className="min-w-0 break-words font-medium leading-6 text-foreground [unicode-bidi:plaintext]">{lecture.title}</p>
              {isReady && (
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary shrink-0">
                  Study Pack
                  <ArrowLeft className="size-3" />
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{formatSize(lecture.file_size_bytes)}</p>
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <StatusBadge status={lecture.status}>
                {isBusy && <Loader2 className="size-3 animate-spin" />}
                {STATUS_LABEL[lecture.status]}
              </StatusBadge>
              {daysLeft !== null && (
                <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400 text-[10px]">
                  <TriangleAlert className="size-3" /> حذف الملف بعد {daysLeft} {daysLeft === 1 ? "يوم" : "أيام"}
                </Badge>
              )}
              {lecture.deleted_at && (
                <Badge variant="outline" className="text-muted-foreground text-[10px]">الملف محذوف</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
