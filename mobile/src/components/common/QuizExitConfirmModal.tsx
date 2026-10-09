import React, { useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { useDialogFocus } from "../../hooks/useDialogFocus";

interface QuizExitConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function QuizExitConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
}: QuizExitConfirmModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, isOpen, onCancel);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
        onClick={onCancel}
      />

      {/* Modal Dialog */}
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="quiz-exit-title"
        aria-describedby="quiz-exit-description"
        tabIndex={-1}
        className="relative z-10 w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-2xl animate-in zoom-in-95 duration-200 text-center"
      >
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
          <AlertTriangle className="size-7" />
        </div>

        <h3 id="quiz-exit-title" className="text-lg font-black text-slate-900 dark:text-white mb-2">
          هل تريد الخروج من الاختبار؟
        </h3>

        <p id="quiz-exit-description" className="text-sm text-slate-500 mb-6 leading-relaxed">
          إذا خرجت الآن فستفقد الإجابات الحالية في هذه الجلسة ولن تُسجل نتيجتك.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-sm active:scale-97 transition-all"
          >
            متابعة الاختبار
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 h-12 rounded-2xl bg-red-600 text-white font-bold text-sm active:scale-97 transition-all shadow-sm shadow-red-600/30"
          >
            خروج الآن
          </button>
        </div>
      </div>
    </div>
  );
}
