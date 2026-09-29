"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Search,
  BookOpen,
  FileCheck2,
  FileQuestion,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronLeft,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SubjectReadinessMetrics } from "@/lib/exams/analytics-service";

interface SearchResults {
  bookSections: Array<{ id: string; title: string; page_number: number | null; content: string }>;
  lectureSections: Array<{ id: string; title: string; page_number: number | null; content: string }>;
  summaryPoints: Array<{ id: string; topic: string; point_type: string; content: string; verification_status: string }>;
  pastExamQuestions: Array<{ id: string; question_text: string; topic: string; status: string; exam_year: number | null }>;
  generatedQuestions: Array<{ id: string; question_text: string; topic: string; status: string }>;
}

export function TrainingCenterView({ subjects }: { subjects: SubjectReadinessMetrics[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`/api/admin/training-center/search?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setIsSearching(false);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "READY":
        return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">جاهزة للتدريب</Badge>;
      case "BUILDING":
        return <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20">قيد البناء والتجهيز</Badge>;
      case "NEEDS_REVIEW":
        return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20">تحتاج مراجعة وتدقيق</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">غير مكتملة</Badge>;
    }
  }

  return (
    <div className="space-y-6">
      {/* Search Across Everything Bar */}
      <Card className="border-primary/20 shadow-xs bg-linear-to-r from-blue-50/50 to-indigo-50/30 dark:from-blue-950/20 dark:to-indigo-950/10">
        <CardContent className="p-5">
          <form onSubmit={handleSearch} className="space-y-2">
            <label className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Search className="size-4 text-primary" />
              البحث الشامل عبر كل مصادر المادة (كتب، محاضرات، ملخصات، وامتحانات)
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="ابحث عن أي مفهوم أو مرض أو دواء (مثال: Heart Failure, Diuretics, ABG)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 bg-background text-sm"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="px-6 h-11 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity shrink-0"
              >
                {isSearching ? "جارٍ البحث..." : "بحث شامل"}
              </button>
            </div>
          </form>

          {/* Search Results Display */}
          {searchResults && (
            <div className="mt-5 border-t border-border/80 pt-4">
              <h3 className="text-sm font-bold text-foreground mb-3">نتائج البحث عن: &ldquo;{searchQuery}&rdquo;</h3>
              <Tabs defaultValue="books" className="w-full">
                <TabsList className="grid grid-cols-4 max-w-2xl h-9">
                  <TabsTrigger value="books" className="text-xs">الكتب ({searchResults.bookSections.length})</TabsTrigger>
                  <TabsTrigger value="lectures" className="text-xs">المحاضرات ({searchResults.lectureSections.length})</TabsTrigger>
                  <TabsTrigger value="summaries" className="text-xs">الملخصات ({searchResults.summaryPoints.length})</TabsTrigger>
                  <TabsTrigger value="exams" className="text-xs">الامتحانات ({searchResults.pastExamQuestions.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="books" className="space-y-2 mt-3">
                  {searchResults.bookSections.length ? (
                    searchResults.bookSections.map((b) => (
                      <div key={b.id} className="p-3 rounded-lg border bg-card text-xs space-y-1">
                        <div className="flex items-center justify-between font-semibold text-primary">
                          <span>{b.title}</span>
                          {b.page_number && <span className="text-muted-foreground">صفحة {b.page_number}</span>}
                        </div>
                        <p className="text-foreground/90 line-clamp-3">{b.content}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground p-3 text-center">لا توجد مقاطع كتب مطابقة</p>
                  )}
                </TabsContent>

                <TabsContent value="lectures" className="space-y-2 mt-3">
                  {searchResults.lectureSections.length ? (
                    searchResults.lectureSections.map((l) => (
                      <div key={l.id} className="p-3 rounded-lg border bg-card text-xs space-y-1">
                        <div className="flex items-center justify-between font-semibold text-blue-600 dark:text-blue-400">
                          <span>{l.title}</span>
                          {l.page_number && <span className="text-muted-foreground">صفحة {l.page_number}</span>}
                        </div>
                        <p className="text-foreground/90 line-clamp-3">{l.content}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground p-3 text-center">لا توجد مقاطع محاضرات مطابقة</p>
                  )}
                </TabsContent>

                <TabsContent value="summaries" className="space-y-2 mt-3">
                  {searchResults.summaryPoints.length ? (
                    searchResults.summaryPoints.map((s) => (
                      <div key={s.id} className="p-3 rounded-lg border bg-card text-xs space-y-1">
                        <div className="flex items-center justify-between font-semibold">
                          <span className="text-purple-600 dark:text-purple-400">{s.topic} ({s.point_type})</span>
                          <Badge variant="outline" className="text-[10px]">{s.verification_status}</Badge>
                        </div>
                        <p className="text-foreground/90">{s.content}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground p-3 text-center">لا توجد نقاط ملخص مطابقة</p>
                  )}
                </TabsContent>

                <TabsContent value="exams" className="space-y-2 mt-3">
                  {searchResults.pastExamQuestions.length ? (
                    searchResults.pastExamQuestions.map((q) => (
                      <div key={q.id} className="p-3 rounded-lg border bg-card text-xs space-y-1">
                        <div className="flex items-center justify-between font-semibold">
                          <span className="text-amber-600 dark:text-amber-400">امتحان {q.exam_year ?? "سابق"} — {q.topic}</span>
                          <Badge variant="outline" className="text-[10px]">{q.status}</Badge>
                        </div>
                        <p className="text-foreground/90 font-medium">{q.question_text}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground p-3 text-center">لا توجد أسئلة امتحانات سابقة مطابقة</p>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subject Readiness Grid / Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">جاهزية المواد وتغطية المعرفة الحقيقية</h2>
          <span className="text-xs text-muted-foreground">محسوبة بنسبة 100% من السجلات والمصادر الفعلية</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المادة</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>نسبة الجاهزية</TableHead>
                <TableHead>الكتب الرسمية</TableHead>
                <TableHead>المحاضرات</TableHead>
                <TableHead>الملخصات</TableHead>
                <TableHead>نماذج الامتحانات</TableHead>
                <TableHead>إجمالي الأسئلة</TableHead>
                <TableHead>المعتمدة</TableHead>
                <TableHead>تحتاج مراجعة</TableHead>
                <TableHead>إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subjects.map((sub) => (
                <TableRow key={sub.subjectId}>
                  <TableCell className="font-semibold text-foreground">
                    {sub.subjectName}
                  </TableCell>
                  <TableCell>{getStatusBadge(sub.readinessStatus)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-primary h-full rounded-full transition-all"
                          style={{ width: `${sub.readinessPercentage}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold">{sub.readinessPercentage}%</span>
                    </div>
                  </TableCell>
                  <TableCell>{sub.officialBooksCount}</TableCell>
                  <TableCell>{sub.lecturesCount}</TableCell>
                  <TableCell>{sub.summariesCount}</TableCell>
                  <TableCell>{sub.pastExamsCount}</TableCell>
                  <TableCell>{sub.totalQuestions}</TableCell>
                  <TableCell className="text-emerald-600 dark:text-emerald-400 font-medium">
                    {sub.verifiedQuestions}
                  </TableCell>
                  <TableCell className="text-amber-600 dark:text-amber-400 font-medium">
                    {sub.needsReviewQuestions}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/question-bank?subjectId=${sub.subjectId}`}
                        className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
                      >
                        بنك الأسئلة
                        <ChevronLeft className="size-3" />
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
