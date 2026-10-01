import { BookOpenText } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="brand-symbol" aria-hidden="true">
        <BookOpenText className="size-5" strokeWidth={1.9} />
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-extrabold tracking-[-0.02em] text-foreground">Nursing AI</span>
          <span className="mt-1 text-[10px] font-semibold tracking-wide text-muted-foreground">رفيقك الدراسي الذكي</span>
        </span>
      )}
    </span>
  );
}
