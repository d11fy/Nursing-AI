import Image from "next/image";
import { cn } from "@/lib/utils";

// Approved Nursing AI symbol (stethoscope + brain + open book). The light-background artwork is
// used by default and the white-on-navy artwork replaces it in dark mode; both images are lazy,
// so the browser only fetches the one that is displayed.
export function BrandSymbol({ className }: { className?: string }) {
  return (
    <>
      <Image src="/brand/logo-symbol.svg" alt="" aria-hidden="true" width={1150} height={1014} className={cn("h-10 w-auto shrink-0 dark:hidden", className)} />
      <Image src="/brand/logo-symbol-dark.svg" alt="" aria-hidden="true" width={1150} height={1014} className={cn("hidden h-10 w-auto shrink-0 dark:block", className)} />
    </>
  );
}

export function BrandMark({
  compact = false,
  stacked = false,
  className,
}: {
  compact?: boolean;
  stacked?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", stacked && "flex-col gap-3 text-center", className)}>
      <BrandSymbol className={compact ? "h-9" : stacked ? "h-20" : "h-10"} />
      {!compact && (
        <span className={cn("flex flex-col leading-none", stacked && "items-center")}>
          <span className={cn("font-extrabold tracking-[-0.02em] text-foreground", stacked ? "text-2xl" : "text-[17px]")}>
            Nursing <span className="dark:text-primary">AI</span>
          </span>
          <span className={cn("mt-1.5 font-semibold tracking-wide text-muted-foreground", stacked ? "text-xs" : "text-[10px]")}>رفيقك الدراسي الذكي</span>
        </span>
      )}
    </span>
  );
}
