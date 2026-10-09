"use client";

import { useState, useEffect, useRef } from "react";
import {
  Layers,
  Sparkles,
  Loader2,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Eye,
  Check,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
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
  const [fetching, setFetching] = useState(initialCards.length === 0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [filterMode, setFilterMode] = useState<"all" | "review_again">("all");
  const [submittingProgress, setSubmittingProgress] = useState(false);

  // If initialCards is empty, load existing cards from API
  useEffect(() => {
    if (cards.length === 0) {
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

  // Keyboard shortcuts. The ref always holds the latest state, so the single
  // listener never acts on a stale card; keys pressed on a focused control
  // (button, link, field, menu) keep their normal meaning.
  const shortcutRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    shortcutRef.current = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input,textarea,select,button,a,[role='button'],[role='menuitem'],[role='dialog'],[contenteditable='true']")) return;
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
    };
  });
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => shortcutRef.current(e);
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Loading State
  if (loading || fetching) {
    return (
      <Card className="border-border p-5 text-center sm:p-12">
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
      <Card className="border-2 border-dashed border-border p-5 text-center sm:p-12">
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
          <Button onClick={() => handleGenerate(false)} size="default" className="h-auto min-h-11 w-full gap-2 whitespace-normal bg-purple-600 text-center leading-5 hover:bg-purple-700 sm:w-auto">
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
        <div className="flex flex-col items-stretch gap-3 rounded-xl border border-border bg-card p-3 shadow-2xs sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          {/* Filter options */}
          <div className="grid grid-cols-1 gap-2 min-[430px]:grid-cols-2">
            <Button
              size="sm"
              variant={filterMode === "all" ? "default" : "outline"}
              className="w-full gap-1.5"
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
              className="w-full gap-1.5"
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
            className="w-full gap-1.5 text-xs text-muted-foreground hover:text-foreground sm:w-auto"
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
        <Card className="space-y-3 border-border p-5 text-center sm:p-8">
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
            className={`flex min-h-[280px] w-full cursor-pointer select-none flex-col justify-between rounded-2xl border-2 p-4 shadow-sm transition-all duration-300 sm:p-8 ${
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
            <div className="grid grid-cols-1 gap-3 animate-in fade-in duration-200 sm:grid-cols-2">
              <Button
                variant="outline"
                size="lg"
                disabled={submittingProgress}
                onClick={(e) => {
                  e.stopPropagation();
                  handleProgress("review_again");
                }}
                className={`h-auto min-h-12 whitespace-normal border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950 font-semibold gap-2 ${
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
                className={`h-auto min-h-12 whitespace-normal bg-green-600 hover:bg-green-700 text-white font-semibold gap-2 ${
                  currentCard.progress_status === "known" ? "ring-2 ring-green-600" : ""
                }`}
              >
                <Check className="size-4" />
                عرفت الإجابة (Known)
              </Button>
            </div>
          )}

          {/* Prev / Next navigation bar */}
          <div className="grid grid-cols-2 items-center gap-2 pt-2 sm:grid-cols-[auto_1fr_auto]">
            <Button
              variant="outline"
              size="sm"
              disabled={currentIndex <= 0}
              onClick={() => {
                setIsFlipped(false);
                setCurrentIndex((i) => Math.max(0, i - 1));
              }}
              className="w-full gap-1 text-xs sm:w-auto"
            >
              <ChevronRight className="size-4" />
              السابق
            </Button>

            <span className="col-span-2 row-start-1 text-center text-xs leading-5 text-muted-foreground sm:col-span-1 sm:col-start-2">
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
              className="w-full gap-1 text-xs sm:w-auto"
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
