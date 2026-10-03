"use client";

import { useState, useEffect } from "react";
import {
  Layers,
  Sparkles,
  Loader2,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Eye,
  Check,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { FlashcardItem } from "../types";

export function FlashcardsTab({
  studyPackId,
  initialCards = [],
}: {
  studyPackId: string;
  initialCards?: FlashcardItem[];
}) {
  const [cards, setCards] = useState<FlashcardItem[]>(initialCards);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [filterMode, setFilterMode] = useState<"all" | "review_again">("all");
  const [submittingProgress, setSubmittingProgress] = useState(false);

  // If initialCards is empty, load existing cards from API
  useEffect(() => {
    if (cards.length === 0) {
      setFetching(true);
      fetch(`/api/study-packs/${studyPackId}/flashcards`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data.cards) && data.cards.length > 0) {
            setCards(data.cards);
          }
        })
        .catch(() => {})
        .finally(() => setFetching(false));
    }
  }, [studyPackId, cards.length]);

  async function handleGenerate(regenerate = false) {
    setLoading(true);
    try {
      const res = await fetch(`/api/study-packs/${studyPackId}/flashcards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "تعذر إنشاء البطاقات");

      setCards(data.cards || []);
      setCurrentIndex(0);
      setIsFlipped(false);
      toast.success(regenerate ? "تمت إعادة إنشاء البطاقات" : "تم إنشاء البطاقات بنجاح");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ أثناء إنشاء البطاقات");
    } finally {
      setLoading(false);
    }
  }

  async function handleProgress(status: "known" | "review_again") {
    const currentCard = activeCards[currentIndex];
    if (!currentCard || submittingProgress) return;

    setSubmittingProgress(true);
    // Optimistic UI update
    setCards((prev) =>
      prev.map((c) =>
        c.id === currentCard.id
          ? {
              ...c,
              progress_status: status,
              review_count: (c.review_count ?? 0) + 1,
            }
          : c
      )
    );

    try {
      await fetch(`/api/study-packs/${studyPackId}/flashcards/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flashcardId: currentCard.id, status }),
      });

      // Move to next card after rating
      if (currentIndex < activeCards.length - 1) {
        setIsFlipped(false);
        setCurrentIndex((i) => i + 1);
      } else {
        toast.success("أكملت مراجعة هذه المجموعة!");
      }
    } catch {
      toast.error("تعذر حفظ تقدم البطاقة");
    } finally {
      setSubmittingProgress(false);
    }
  }

  // Filtered cards
  const activeCards =
    filterMode === "review_again"
      ? cards.filter((c) => c.progress_status === "review_again")
      : cards;

  const knownCount = cards.filter((c) => c.progress_status === "known").length;
  const reviewAgainCount = cards.filter((c) => c.progress_status === "review_again").length;
  const progressPercent = cards.length > 0 ? Math.round((knownCount / cards.length) * 100) : 0;

  // Keyboard shortcut listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setIsFlipped((f) => !f);
      } else if (e.key === "ArrowLeft" && isFlipped) {
        e.preventDefault();
        handleProgress("known");
      } else if (e.key === "ArrowRight" && isFlipped) {
        e.preventDefault();
        handleProgress("review_again");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFlipped, currentIndex, activeCards]);

  // Loading State
  if (loading || fetching) {
    return (
      <Card className="border-border p-12 text-center">
        <div className="flex flex-col items-center justify-center space-y-4 max-w-md mx-auto">
          <Loader2 className="size-8 text-primary animate-spin" />
          <p className="text-sm font-semibold text-foreground">
            {loading ? "جارٍ إعداد البطاقات التعليمية..." : "تحميل البطاقات..."}
          </p>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </Card>
    );
  }

  // Empty State
  if (!cards.length) {
    return (
      <Card className="border-dashed border-2 border-border p-12 text-center">
        <div className="flex flex-col items-center justify-center max-w-md mx-auto space-y-4">
          <div className="size-12 rounded-full bg-purple-500/10 text-purple-600 flex items-center justify-center">
            <Layers className="size-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-foreground">لم يتم إنشاء البطاقات بعد</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              أنشئ 10–20 بطاقة ذكية لمراجعة المفاهيم والتعريفات والأعراض والتدخلات السريرية لهذه المحاضرة وحفظ تقدمك.
            </p>
          </div>
          <Button onClick={() => handleGenerate(false)} size="default" className="gap-2 bg-purple-600 hover:bg-purple-700">
            <Sparkles className="size-4" />
            إنشاء البطاقات التعليمية الآن
          </Button>
        </div>
      </Card>
    );
  }

  const currentCard = activeCards[currentIndex];

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Header controls & filter tabs */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-border bg-card shadow-2xs">
          {/* Filter options */}
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant={filterMode === "all" ? "default" : "outline"}
              className="h-8 text-xs gap-1.5"
              onClick={() => {
                setFilterMode("all");
                setCurrentIndex(0);
                setIsFlipped(false);
              }}
            >
              كافة البطاقات
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                {cards.length}
              </Badge>
            </Button>
            <Button
              size="sm"
              variant={filterMode === "review_again" ? "default" : "outline"}
              className="h-8 text-xs gap-1.5"
              disabled={reviewAgainCount === 0}
              onClick={() => {
                setFilterMode("review_again");
                setCurrentIndex(0);
                setIsFlipped(false);
              }}
            >
              بحاجة لمراجعة
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-amber-500/10 text-amber-600">
                {reviewAgainCount}
              </Badge>
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleGenerate(true)}
            className="h-8 text-xs text-muted-foreground gap-1.5 hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
            إعادة إنشاء البطاقات
          </Button>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5 px-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>تم إتقانها: {knownCount} من {cards.length}</span>
            <span className="font-semibold text-foreground">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-1.5" />
        </div>
      </div>

      {/* Empty in filtered mode check */}
      {!currentCard ? (
        <Card className="border-border p-8 text-center space-y-3">
          <CheckCircle2 className="size-10 text-green-500 mx-auto" />
          <h4 className="text-sm font-bold text-foreground">رائع! لا توجد بطاقات بحاجة لمراجعة حاليًا</h4>
          <p className="text-xs text-muted-foreground">
            لقد راجعت جميع البطاقات ووضعتها في خانة &ldquo;عرفت&rdquo;.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setFilterMode("all");
              setCurrentIndex(0);
            }}
          >
            عرض كافة البطاقات
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Card Flip Container */}
          <div
            onClick={() => setIsFlipped((f) => !f)}
            role="button"
            tabIndex={0}
            aria-label="اقلب البطاقة"
            className={`w-full min-h-[280px] p-8 rounded-2xl border-2 transition-all duration-300 cursor-pointer flex flex-col justify-between select-none shadow-sm ${
              isFlipped
                ? "bg-muted/40 border-primary/40 shadow-md"
                : "bg-card border-border hover:border-primary/50"
            }`}
          >
            {/* Top card metadata */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <Badge variant="outline" className="text-[11px] font-semibold">
                {currentCard.card_type
                  ? currentCard.card_type.replace("_", " ")
                  : "مفهوم تمريضي"}
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">
                {currentIndex + 1} / {activeCards.length}
              </span>
            </div>

            {/* Main prompt / answer */}
            <div className="my-auto py-6 text-center space-y-3">
              {!isFlipped ? (
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground font-semibold block">سؤال / المفهوم</span>
                  <p dir="auto" className="text-base sm:text-lg font-bold text-foreground leading-relaxed [unicode-bidi:plaintext]">
                    {currentCard.front}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <span className="text-xs text-primary font-semibold block">الإجابة والتوضيح</span>
                  <p dir="auto" className="text-base sm:text-lg font-bold text-foreground leading-relaxed [unicode-bidi:plaintext]">
                    {currentCard.back}
                  </p>
                  {currentCard.explanation && (
                    <p dir="auto" className="text-xs text-muted-foreground max-w-md mx-auto [unicode-bidi:plaintext]">
                      {currentCard.explanation}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Bottom flip hint */}
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Eye className="size-3.5" />
              <span>{isFlipped ? "انقر للعودة للسؤال" : "انقر لرؤية الإجابة (أو مسافة باللوحة)"}</span>
            </div>
          </div>

          {/* Action rating buttons (Visible after flip) */}
          {isFlipped && (
            <div className="grid grid-cols-2 gap-3 animate-in fade-in duration-200">
              <Button
                variant="outline"
                size="lg"
                disabled={submittingProgress}
                onClick={(e) => {
                  e.stopPropagation();
                  handleProgress("review_again");
                }}
                className={`h-12 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950 font-semibold gap-2 ${
                  currentCard.progress_status === "review_again" ? "ring-2 ring-amber-500" : ""
                }`}
              >
                <RefreshCw className="size-4" />
                راجعها لاحقًا (Review Again)
              </Button>

              <Button
                variant="default"
                size="lg"
                disabled={submittingProgress}
                onClick={(e) => {
                  e.stopPropagation();
                  handleProgress("known");
                }}
                className={`h-12 bg-green-600 hover:bg-green-700 text-white font-semibold gap-2 ${
                  currentCard.progress_status === "known" ? "ring-2 ring-green-600" : ""
                }`}
              >
                <Check className="size-4" />
                عرفت الإجابة (Known)
              </Button>
            </div>
          )}

          {/* Prev / Next navigation bar */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentIndex <= 0}
              onClick={() => {
                setIsFlipped(false);
                setCurrentIndex((i) => Math.max(0, i - 1));
              }}
              className="gap-1 text-xs"
            >
              <ChevronRight className="size-4" />
              السابق
            </Button>

            <span className="text-xs text-muted-foreground">
              استخدم الأسهم ◄ ► للتنقل والتقييم
            </span>

            <Button
              variant="outline"
              size="sm"
              disabled={currentIndex >= activeCards.length - 1}
              onClick={() => {
                setIsFlipped(false);
                setCurrentIndex((i) => Math.min(activeCards.length - 1, i + 1));
              }}
              className="gap-1 text-xs"
            >
              التالي
              <ChevronLeft className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
