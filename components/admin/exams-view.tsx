"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FileCheck2,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronLeft,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ExamRow {
  id: string;
  subject_id: string;
  subject_name: string;
  title: string;
  exam_year: number | null;
  semester: number | null;
  exam_type: string;
  doctor_name: string | null;
  status: string;
  total_questions: number;
  verified_questions: number;
  needs_review_questions: number;
  conflict_questions: number;
  error_message: string | null;
  created_at: string;
}

export function ExamsView({
  initialExams,
  subjects,
}: {
  initialExams: ExamRow[];
  subjects: { id: string; name_ar: string }[];
}) {
  const [exams, setExams] = useState<ExamRow[]>(initialExams);
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);

  const filteredExams = exams.filter((e) => {
    if (selectedSubject !== "all" && e.subject_id !== selectedSubject) return false;
    if (search.trim()) {
      const term = search.toLowerCase();
      const matchTitle = e.title.toLowerCase().includes(term);
      const matchSubject = e.subject_name.toLowerCase().includes(term);
      const matchDoc = (e.doctor_name || "").toLowerCase().includes(term);
      if (!matchTitle && !matchSubject && !matchDoc) return false;
    }
    return true;
  });

  async function handleReprocess(examId: string) {
    setReprocessingId(examId);
    try {
      const res = await fetch("/api/admin/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل بدء إعادة المعالجة");

      toast.success(data.message || "تم بدء إعادة المعالجة في الخلفية");
      setExams((prev) =>
        prev.map((it) => (it.id === examId ? { ...it, status: "PROCESSING" } : it))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setReprocessingId(null);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "READY":
        return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">جاهز</Badge>;
      case "VERIFYING":
        return <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/20">جاري التحقق من الأدلة</Badge>;
      case "PROCESSING":
      case "EXTRACTING":
        return <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20">جاري الاستخراج والتقطيع</Badge>;
      case "FAILED":
        return <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20">فشل</Badge>;
      default:
        return <Badge variant="outline">مرفوع</Badge>;
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="size-4 absolute right-3 top-3 text-muted-foreground" />
          <Input
            placeholder="بحث باسم الامتحان أو المادة أو الدكتور..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9 h-10 text-sm"
          />
        </div>
        <div className="w-full sm:w-64">
          <Select value={selectedSubject} onValueChange={(val) => { if (val) setSelectedSubject(val); }}>
            <SelectTrigger className="h-10 text-sm">
              <SelectValue placeholder="تصفية حسب المادة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع المواد الدراسية</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name_ar}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Exams Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>عنوان النموذج / الامتحان</TableHead>
              <TableHead>المادة</TableHead>
              <TableHead>السنة / الفصل</TableHead>
              <TableHead>نوع الامتحان</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>الأسئلة</TableHead>
              <TableHead>معتمدة</TableHead>
              <TableHead>مراجعة</TableHead>
              <TableHead>تعارض</TableHead>
              <TableHead>إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredExams.length ? (
              filteredExams.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <div>
                      <span className="font-semibold text-foreground block">{e.title}</span>
                      {e.doctor_name && (
                        <span className="text-[11px] text-muted-foreground">د. {e.doctor_name}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{e.subject_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {e.exam_year ? `عام ${e.exam_year}` : "—"}
                    {e.semester && ` (فصل ${e.semester})`}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[11px]">{e.exam_type}</Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(e.status)}</TableCell>
                  <TableCell className="font-bold">{e.total_questions}</TableCell>
                  <TableCell className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    {e.verified_questions}
                  </TableCell>
                  <TableCell className="text-amber-600 dark:text-amber-400 font-semibold">
                    {e.needs_review_questions}
                  </TableCell>
                  <TableCell className="text-rose-600 dark:text-rose-400 font-semibold">
                    {e.conflict_questions}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/question-bank?subjectId=${e.subject_id}`}
                        className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
                      >
                        الأسئلة
                        <ChevronLeft className="size-3" />
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        title="إعادة المعالجة والتحقق"
                        disabled={reprocessingId === e.id || e.status === "PROCESSING" || e.status === "VERIFYING"}
                        onClick={() => handleReprocess(e.id)}
                      >
                        <RefreshCw className={`size-3.5 ${reprocessingId === e.id ? "animate-spin" : ""}`} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-sm text-muted-foreground">
                  لا توجد نماذج امتحانات مطابقة. يمكنك رفع نماذج جديدة عبر قاعدة المعرفة.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
