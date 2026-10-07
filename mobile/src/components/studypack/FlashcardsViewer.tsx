import React, { useState } from "react";
import { RotateCw, CheckCircle2, RotateCcw, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { apiFetch } from "../../services/api";

interface Flashcard {
  id: string;
  front: string;
  back: string;
  topic?: string | null;
  clinical_pearl?: string | null;
  mastery_level?: number;
}

export function FlashcardsViewer({
  studyPackId,
  cards: initialCards,
}: {
  studyPackId: string;
  cards: Flashcard[];
}) {
  const [cards, setCards] = useState<Flashcard[]>(initialCards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [submittingRating, setSubmittingRating] = useState(false);

  const currentCard = cards[currentIndex];

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleNext = () => {
    setIsFlipped(false);
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    setIsFlipped(false);
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleRate = async (rating: "again" | "good" | "easy") => {
    if (!currentCard || submittingRating) return;
    setSubmittingRating(true);
    try {
      await apiFetch(`/api/study-packs/${studyPackId}/flashcards/progress`, {
        method: "POST",
        body: JSON.stringify({
          cardId: currentCard.id,
          rating,
        }),
      });
      handleNext();
    } catch (e) {
      console.warn("Failed recording rating:", e);
      handleNext();
    } finally {
      setSubmittingRating(false);
    }
  };

  if (!currentCard) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-400">
        لا توجد بطاقات متاحة.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress & Counter */}
      <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-1">
        <span>
          البطاقة {currentIndex + 1} من {cards.length}
        </span>
        {currentCard.topic && (
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-300">
            {currentCard.topic}
          </span>
        )}
      </div>

      <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
        />
      </div>

      {/* Interactive 3D Flip Card */}
      <div
        onClick={handleFlip}
        className="perspective-1000 min-h-[260px] cursor-pointer"
      >
        <div
          className={`relative w-full min-h-[260px] rounded-3xl p-6 transition-transform duration-500 transform-style-3d shadow-md border ${
            isFlipped
              ? "rotate-y-180 bg-teal-900 text-white border-teal-800"
              : "bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-200 dark:border-slate-800"
          }`}
        >
          {/* Card Front (Question / Term) */}
          <div className={`backface-hidden flex flex-col justify-between h-full ${isFlipped ? "hidden" : "flex"}`}>
            <div className="space-y-3">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">
                <Sparkles className="size-3" />
                السؤال / المفهوم
              </span>
              <p className="text-sm font-black leading-relaxed selectable-text">
                {currentCard.front}
              </p>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-6">
              <span>المس البطاقة لقلبها وقراءة الإجابة</span>
              <RotateCw className="size-3.5" />
            </div>
          </div>

          {/* Card Back (Answer / Explanation) */}
          <div className={`rotate-y-180 backface-hidden flex flex-col justify-between h-full ${isFlipped ? "flex" : "hidden"}`}>
            <div className="space-y-3">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-300">
                <CheckCircle2 className="size-3" />
                الإجابة والتفسير السريري
              </span>
              <p className="text-xs font-bold text-slate-100 leading-relaxed selectable-text">
                {currentCard.back}
              </p>
              {currentCard.clinical_pearl && (
                <div className="rounded-xl bg-teal-800/80 p-2.5 text-[11px] text-teal-100 mt-2">
                  💡 <strong>نقطة سريرية:</strong> {currentCard.clinical_pearl}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-teal-300 pt-6">
              <span>المس للرجوع إلى السؤال</span>
              <RotateCw className="size-3.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Rating Buttons */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={() => handleRate("again")}
          disabled={submittingRating}
          className="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-bold active:scale-97 transition-all"
        >
          <RotateCcw className="size-3.5" />
          <span>مراجعة لاحقًا</span>
        </button>

        <button
          onClick={() => handleRate("good")}
          disabled={submittingRating}
          className="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-2xl bg-teal-50 dark:bg-teal-950/40 text-primary dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-xs font-bold active:scale-97 transition-all"
        >
          <CheckCircle2 className="size-3.5" />
          <span>أتقنتها</span>
        </button>
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="flex items-center gap-1 px-4 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold disabled:opacity-30 active:scale-95"
        >
          <ChevronRight className="size-4" />
          <span>السابق</span>
        </button>

        <button
          onClick={handleNext}
          disabled={currentIndex === cards.length - 1}
          className="flex items-center gap-1 px-4 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold disabled:opacity-30 active:scale-95"
        >
          <span>التالي</span>
          <ChevronLeft className="size-4" />
        </button>
      </div>
    </div>
  );
}
