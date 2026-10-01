import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  eyebrow,
  icon: Icon,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("page-heading", className)}>
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon && (
          <span className="icon-tile mt-0.5 shrink-0" aria-hidden="true">
            <Icon className="size-5" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
          <h1 className="text-balance text-xl font-extrabold leading-[1.55] tracking-[-0.025em] text-foreground sm:text-2xl">
            {title}
          </h1>
          {description && (
            <div className="mt-1.5 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-[15px]">
              {description}
            </div>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
