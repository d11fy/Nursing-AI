import { registerBackHandler } from "../../services/capacitor";
import React, { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { useDialogFocus } from "../../hooks/useDialogFocus";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
}: BottomSheetProps) {
  const closeRef = useRef(onClose);
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocus(sheetRef, isOpen, onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!isOpen) return;
    return registerBackHandler(() => {
      closeRef.current();
      return true;
    });
  }, [isOpen]);
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Sheet Content */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        {...(title ? { "aria-labelledby": titleId } : { "aria-label": "خيارات" })}
        className="relative z-10 max-h-[85vh] w-full rounded-t-3xl bg-white dark:bg-slate-900 pb-safe shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-250"
      >
        {/* Handle */}
        <div aria-hidden="true" className="flex justify-center pt-3 pb-1" onClick={onClose}>
          <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <h3 id={titleId} className="text-base font-bold text-slate-900 dark:text-white">
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="flex size-11 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 max-h-[calc(85vh-120px)]">
          {children}
        </div>
      </div>
    </div>
  );
}
