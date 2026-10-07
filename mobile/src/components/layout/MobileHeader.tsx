import React from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { useNavigation } from "../../context/NavigationContext";

interface MobileHeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  actions?: React.ReactNode;
}

export function MobileHeader({
  title,
  subtitle,
  showBack,
  onBack,
  actions,
}: MobileHeaderProps) {
  const { goBack, canGoBack } = useNavigation();

  const shouldShowBack = showBack ?? canGoBack;

  return (
    <header className="sticky top-0 z-30 flex flex-col bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 pt-safe transition-colors">
      <div className="flex h-14 items-center justify-between px-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {shouldShowBack ? (
            <button
              onClick={onBack || goBack}
              className="flex size-10 items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 transition-all"
              aria-label="الرجوع"
            >
              <ArrowRight className="size-5" />
            </button>
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-xs">
              <Sparkles className="size-5" />
            </div>
          )}

          <div className="min-w-0">
            {title ? (
              <h1 className="truncate text-base font-black text-slate-900 dark:text-white leading-tight">
                {title}
              </h1>
            ) : (
              <span className="text-base font-black tracking-tight text-primary">
                Nursing AI
              </span>
            )}
            {subtitle && (
              <p className="truncate text-xs font-medium text-slate-500">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {actions && <div className="flex items-center gap-1.5">{actions}</div>}
      </div>
    </header>
  );
}
