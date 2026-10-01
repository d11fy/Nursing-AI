import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="icon-tile mx-auto size-12" aria-hidden="true">
        <Icon className="size-5" />
      </span>
      <h2 className="mt-4 text-base font-bold text-foreground">{title}</h2>
      {description && <p className="mx-auto mt-1.5 max-w-md text-sm leading-7 text-muted-foreground">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
