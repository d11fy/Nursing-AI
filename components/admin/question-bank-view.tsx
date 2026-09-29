"use client";

import { useState } from "react";
import {
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Edit3,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface QuestionSourceItem {
  id: string;
  documentId: string;
  documentTitle: string;
  pageNumber: number | null;
  quote: string | null;
  supportType: string;
  sourcePriority: number;
}

export interface QuestionBankItem {
  id: string;
  subject_id: string;
  subject_name: string;
  exam_title: string | null;
  exam_year: number | null;
  question_text: string;
  question_type: string;
  options_json: string[] | Array<{ text: string }>;
  correct_answer_json: unknown;
  extracted_answer: string | null;
  explanation: string | null;
  topic: string;
  subtopic: string | null;
  difficulty: string;
  status: string;
  confidence: number;
  page_number: number | null;
  question_number: number | null;
  review_notes: string | null;
  sources: QuestionSourceItem[];
}

export function QuestionBankView({
  initialQuestions,
  subjects,
  totalCount,
}: {
  initialQuestions: QuestionBankItem[];
  subjects: { id: string; name_ar: string }[];
  totalCount: number;
}) {
  const [questions, setQuestions] = useState<QuestionBankItem[]>(initialQuestions);
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [searchTopic, setSearchTopic] = useState("");
  const [editingQuestion, setEditingQuestion] = useState<QuestionBankItem | null>(null);
  const [editText, setEditText] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = questions.filter((q) => {
    if (selectedSubject !== "all" && q.subject_id !== selectedSubject) return false;
    if (selectedStatus !== "all" && q.status !== selectedStatus) return false;
    if (selectedType !== "all" && q.question_type !== selectedType) return false;
    if (searchTopic.trim()) {
      const term = searchTopic.toLowerCase();
      const matchTopic = q.topic.toLowerCase().includes(term);
      const matchText = q.question_text.toLowerCase().includes(term);
      if (!matchTopic && !matchText) return false;
    }
    return true;
  });

  async function handleAction(
    questionId: string,
    action: "APPROVE" | "REJECT" | "NEEDS_REVIEW"
  ) {
    try {
      const res = await fetch("/api/admin/question-bank", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تحديث السؤال");

      toast.success(data.message || "تم تحديث السؤال");
      const newStatus = action === "APPROVE" ? "VERIFIED" : action === "REJECT" ? "REJECTED" : "NEEDS_REVIEW";
      setQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, status: newStatus } : q))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    }
  }

  async function handleSaveEdit() {
    if (!editingQuestion || !editText.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/question-bank", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: editingQuestion.id,
          action: "EDIT",
          questionText: editText,
          reviewNotes: editNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تعديل السؤال");

      toast.success("تم حفظ التعديل وإعادة التحقق من السؤال بنجاح");
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === editingQuestion.id
            ? { ...q, question_text: editText, status: data.status || q.status }
            : q
        )
      );
      setEditingQuestion(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setIsSubmitting(false);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "VERIFIED":
        return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">معتمد وموثق</Badge>;
      case "NEEDS_REVIEW":
        return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20">يحتاج مراجعة</Badge>;
      case "CONFLICT":
        return <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/20">تعارض مع المرجع</Badge>;
      case "REJECTED":
        return <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20">مستبعد</Badge>;
      default:
        return <Badge variant="outline">مستخرج</Badge>;
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-card p-3 rounded-xl border border-border">
        <div>
          <Select value={selectedSubject} onValueChange={(val) => { if (val) setSelectedSubject(val); }}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="المادة الدراسية" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع المواد</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name_ar}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Select value={selectedStatus} onValueChange={(val) => { if (val) setSelectedStatus(val); }}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="حالة السؤال" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الحالات</SelectItem>
              <SelectItem value="VERIFIED">معتمد وموثق (VERIFIED)</SelectItem>
              <SelectItem value="NEEDS_REVIEW">يحتاج مراجعة (NEEDS_REVIEW)</SelectItem>
              <SelectItem value="CONFLICT">تعارض مع المرجع (CONFLICT)</SelectItem>
              <SelectItem value="REJECTED">مستبعد (REJECTED)</SelectItem>
              <SelectItem value="EXTRACTED">مستخرج مبدئيًا</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Select value={selectedType} onValueChange={(val) => { if (val) setSelectedType(val); }}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="نوع السؤال" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع أنواع الأسئلة</SelectItem>
              <SelectItem value="MCQ">اختيار من متعدد (MCQ)</SelectItem>
              <SelectItem value="TRUE_FALSE">صح أو خطأ (True/False)</SelectItem>
              <SelectItem value="SATA">اختر كل ما ينطبق (SATA)</SelectItem>
              <SelectItem value="PRIORITY">أولوية سريرية (Priority)</SelectItem>
              <SelectItem value="CALCULATION">حساب جرعات (Calculation)</SelectItem>
              <SelectItem value="CASE_STUDY">حالة دراسية (Case Study)</SelectItem>
              <SelectItem value="SHORT_ANSWER">إجابة قصيرة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Input
            placeholder="بحث بالموضوع أو نص السؤال..."
            value={searchTopic}
            onChange={(e) => setSearchTopic(e.target.value)}
            className="h-9 text-xs"
          />
        </div>
      </div>

      {/* Questions Review List */}
      <div className="space-y-3">
        {filtered.length ? (
          filtered.map((q) => {
            const isExpanded = expandedId === q.id;
            const options: string[] = Array.isArray(q.options_json)
              ? q.options_json.map((o) => (typeof o === "string" ? o : JSON.stringify(o)))
              : [];

            return (
              <div
                key={q.id}
                className="rounded-xl border border-border bg-card p-4 transition-all space-y-3 shadow-xs"
              >
                {/* Header row */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-primary">{q.subject_name}</span>
                    <span className="text-muted-foreground">•</span>
                    <Badge variant="secondary" className="text-[11px]">{q.topic}</Badge>
                    <Badge variant="outline" className="text-[10px]">{q.question_type}</Badge>
                    {q.exam_year && (
                      <span className="text-[11px] text-muted-foreground">امتحان {q.exam_year}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(q.status)}
                    <span className="text-[11px] text-muted-foreground">
                      دقة: {Math.round((q.confidence || 0.5) * 100)}%
                    </span>
                  </div>
                </div>

                {/* Question Text */}
                <p className="text-sm font-semibold text-foreground leading-relaxed">
                  {q.question_number ? `${q.question_number}. ` : ""}{q.question_text}
                </p>

                {/* Options if available */}
                {options.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {options.map((opt, i) => (
                      <div
                        key={i}
                        className="text-xs p-2 rounded-lg border bg-muted/20 text-foreground/90"
                      >
                        {opt}
                      </div>
                    ))}
                  </div>
                )}

                {/* Extracted vs System Answer comparison */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-muted/30 text-xs">
                  <div>
                    <span className="text-muted-foreground block mb-0.5">الإجابة المستخرجة من الامتحان:</span>
                    <span className="font-semibold text-foreground">
                      {q.extracted_answer || "غير محددة في ورقة الامتحان"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-0.5">الإجابة المحققة عبر المنهج:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {q.correct_answer_json ? String(q.correct_answer_json) : "قيد المراجعة / لا يوجد سند كافٍ"}
                    </span>
                  </div>
                </div>

                {/* Evidence & Sources Accordion */}
                <div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : q.id)}
                    className="flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
                  >
                    <span>الأدلة والشواهد المرجعية ({q.sources.length})</span>
                    {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                  </button>

                  {isExpanded && (
                    <div className="mt-2.5 p-3 rounded-lg bg-background border border-border text-xs space-y-2">
                      {q.sources.length ? (
                        q.sources.map((s) => (
                          <div key={s.id} className="border-b border-border/40 pb-2 last:border-0 last:pb-0">
                            <div className="flex items-center justify-between font-semibold text-foreground mb-1">
                              <span>{s.documentTitle}</span>
                              <span className="text-muted-foreground">
                                {s.pageNumber ? `صفحة ${s.pageNumber}` : ""} • {s.supportType}
                              </span>
                            </div>
                            {s.quote && (
                              <p className="text-muted-foreground italic bg-muted/40 p-2 rounded-md">
                                &ldquo;{s.quote}&rdquo;
                              </p>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground">لا توجد أدلة مرتبطة بعد.</p>
                      )}
                      {q.explanation && (
                        <div className="pt-2 border-t border-border/50">
                          <span className="font-semibold text-foreground block mb-0.5">الشرح التوضيحي:</span>
                          <p className="text-foreground/90">{q.explanation}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                      onClick={() => handleAction(q.id, "APPROVE")}
                    >
                      <CheckCircle2 className="size-3.5 ml-1" />
                      اعتماد السؤال
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950"
                      onClick={() => handleAction(q.id, "NEEDS_REVIEW")}
                    >
                      <Clock className="size-3.5 ml-1" />
                      تعيين للمراجعة
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950"
                      onClick={() => handleAction(q.id, "REJECT")}
                    >
                      <XCircle className="size-3.5 ml-1" />
                      استبعاد
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setEditingQuestion(q);
                      setEditText(q.question_text);
                      setEditNotes(q.review_notes || "");
                    }}
                  >
                    <Edit3 className="size-3.5 ml-1" />
                    تعديل نص السؤال (OCR)
                  </Button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            لا توجد أسئلة مطابقة للشروط المحددة.
          </div>
        )}
      </div>

      {/* Edit Question Dialog */}
      {editingQuestion && (
        <Dialog open={Boolean(editingQuestion)} onOpenChange={(open) => !open && setEditingQuestion(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">
                تعديل نص السؤال وإعادة التحقق الفردي
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2 text-xs">
              <p className="text-muted-foreground">
                عند تصحيح نص السؤال (OCR)، سيعيد النظام التحقق من الأدلة المرجعية لهذا السؤال فقط دون إعادة فحص كامل الامتحان.
              </p>
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">نص السؤال</label>
                <Textarea
                  rows={4}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">ملاحظات التدقيق</label>
                <Input
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="سبب التعديل..."
                  className="text-xs h-9"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingQuestion(null)}
                disabled={isSubmitting}
              >
                إلغاء
              </Button>
              <Button
                size="sm"
                onClick={handleSaveEdit}
                disabled={isSubmitting}
              >
                {isSubmitting ? "جارٍ الحفظ والتحقق..." : "حفظ وإعادة التحقق"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
