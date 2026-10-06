"use client";

import { useState } from "react";
import {
  ChevronRight,
  ChevronLeft,
  Search,
  BookOpen,
  Sparkles,
  FileText,
  HelpCircle,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { ExtractedPageItem } from "../types";

export function StudyTab({
  pages,
  lectureTitle,
  subjectName,
  onNavigateTab,
}: {
  pages: ExtractedPageItem[];
  lectureTitle: string;
  subjectName: string;
  onNavigateTab: (tab: string) => void;
}) {
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  if (!pages || pages.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="flex flex-col items-center justify-center p-5 text-center sm:p-12">
          <FileText className="size-10 text-muted-foreground/60 mb-3" />
          <h3 className="text-base font-bold text-foreground">لا يتوفر نص مستخرج</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">
            لم نتمكن من استخراج صفحات نصية مباشرة من هذا الملف، ولكن يمكنك استخدام تبويب &ldquo;اسأل AI&rdquo; أو إنشاء الملخص والبطاقات.
          </p>
          <div className="mt-4 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button size="sm" onClick={() => onNavigateTab("summary")}>
              انتقل إلى الملخص
            </Button>
            <Button size="sm" variant="outline" onClick={() => onNavigateTab("ask")}>
              اسأل الذكاء الاصطناعي
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Filter pages if search is active
  const filteredPages = searchQuery.trim()
    ? pages
        .map((p, idx) => ({ ...p, originalIndex: idx }))
        .filter((p) => p.text.toLowerCase().includes(searchQuery.toLowerCase().trim()))
    : pages.map((p, idx) => ({ ...p, originalIndex: idx }));

  const activePage = pages[currentPageIndex] ?? pages[0];
  const pageNumberLabel = activePage.pageNumber
    ? `الصفحة / الشريحة ${activePage.pageNumber}`
    : `القسم ${currentPageIndex + 1}`;

  return (
    <div className="space-y-4">
      {/* Quick Study Navigation Bar */}
      <div className="flex flex-col items-stretch gap-3 rounded-xl border border-border bg-card p-3 shadow-2xs sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-semibold text-xs">
            {subjectName}
          </Badge>
          <span className="text-xs text-muted-foreground">
            إجمالي الصفحات: <strong className="text-foreground">{pages.length}</strong>
          </span>
        </div>

        {/* Quick action buttons */}
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 text-xs scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 gap-1 text-xs"
            onClick={() => onNavigateTab("summary")}
          >
            <FileText className="size-3.5 text-primary" />
            الملخص
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 gap-1 text-xs"
            onClick={() => onNavigateTab("key_points")}
          >
            <Sparkles className="size-3.5 text-amber-500" />
            أهم النقاط
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 gap-1 text-xs"
            onClick={() => onNavigateTab("flashcards")}
          >
            <Layers className="size-3.5 text-purple-500" />
            البطاقات
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 gap-1 text-xs"
            onClick={() => onNavigateTab("quiz")}
          >
            <HelpCircle className="size-3.5 text-green-500" />
            الاختبار
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1 border-primary/30 text-xs"
            onClick={() => onNavigateTab("ask")}
          >
            <BookOpen className="size-3.5 text-primary" />
            اسأل AI
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Sidebar: Page List & Search */}
        <Card className="md:col-span-1 border-border">
          <CardHeader className="p-3 pb-2 space-y-2">
            <CardTitle className="text-xs font-bold text-foreground">فهرس المحتوى</CardTitle>
            <div className="relative">
              <Search className="size-3.5 absolute right-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="بحث في الصفحات..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pe-3 ps-8 text-sm bg-muted/40"
              />
            </div>
          </CardHeader>
          <CardContent className="p-2 pt-0 max-h-[500px] overflow-y-auto space-y-1">
            {filteredPages.length > 0 ? (
              filteredPages.map((page) => {
                const isSelected = page.originalIndex === currentPageIndex;
                const label = page.pageNumber ? `صفحة ${page.pageNumber}` : `قسم ${page.originalIndex + 1}`;
                return (
                  <button
                    key={page.originalIndex}
                    onClick={() => setCurrentPageIndex(page.originalIndex)}
                    className={`flex min-h-11 w-full items-center justify-between rounded-lg p-2 text-start text-xs transition-colors ${
                      isSelected
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <span className="min-w-0 break-words">{label}</span>
                    {page.ocr && (
                      <Badge variant="outline" className={`text-[10px] px-1 py-0 ${isSelected ? "border-primary-foreground/30 text-primary-foreground" : ""}`}>
                        OCR
                      </Badge>
                    )}
                  </button>
                );
              })
            ) : (
              <p className="text-center text-xs text-muted-foreground py-4">لا توجد نتائج مطابقة</p>
            )}
          </CardContent>
        </Card>

        {/* Viewer: Active Page Content */}
        <Card className="md:col-span-3 border-border flex flex-col shadow-xs">
          <CardHeader className="flex flex-col items-stretch gap-3 border-b border-border/60 p-4 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center">
              <Badge variant="outline" className="text-xs font-bold text-primary border-primary/30">
                {pageNumberLabel}
              </Badge>
              <span dir="auto" className="min-w-0 break-words text-xs leading-5 text-muted-foreground [unicode-bidi:plaintext]">
                {lectureTitle}
              </span>
            </div>

            {/* Navigation Controls */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 sm:flex">
              <Button
                variant="outline"
                size="sm"
                className="w-full px-2 sm:w-auto"
                disabled={currentPageIndex <= 0}
                onClick={() => setCurrentPageIndex((prev) => Math.max(0, prev - 1))}
                aria-label="الصفحة السابقة"
              >
                <ChevronRight className="size-4" />
                <span className="hidden sm:inline text-xs mr-1">السابق</span>
              </Button>
              <span className="text-xs font-semibold px-2">
                {currentPageIndex + 1} / {pages.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="w-full px-2 sm:w-auto"
                disabled={currentPageIndex >= pages.length - 1}
                onClick={() => setCurrentPageIndex((prev) => Math.min(pages.length - 1, prev + 1))}
                aria-label="الصفحة التالية"
              >
                <span className="hidden sm:inline text-xs ml-1">التالي</span>
                <ChevronLeft className="size-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="min-h-[320px] flex-1 overflow-y-auto p-4 sm:min-h-[400px] sm:p-6">
            <div
              dir="ltr"
              className="text-start font-mono text-sm leading-relaxed whitespace-pre-wrap text-foreground select-text"
            >
              {activePage.text.trim()}
            </div>
          </CardContent>

          {/* Bottom helper toolbar */}
          <div className="flex flex-col items-stretch gap-2 border-t border-border/60 bg-muted/20 p-3 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <span className="text-muted-foreground">
              هل تواجه صعوبة في فهم هذه الشريحة؟
            </span>
            <Button
              size="sm"
              variant="default"
              className="h-auto min-h-11 gap-1.5 whitespace-normal text-center text-xs leading-5"
              onClick={() => onNavigateTab("ask")}
            >
              <Sparkles className="size-3.5" />
              اسأل AI ليشرح لك هذه الصفحة
              <ArrowRight className="size-3" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
