import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  ready: "border-success/20 bg-success/10 text-success",
  active: "border-success/20 bg-success/10 text-success",
  completed: "border-success/20 bg-success/10 text-success",
  failed: "border-destructive/20 bg-destructive/10 text-destructive",
  needs_review: "border-warning/25 bg-warning/10 text-amber-800 dark:text-amber-300",
  uploading: "border-primary/20 bg-primary/10 text-primary",
  uploaded: "border-primary/20 bg-primary/10 text-primary",
  processing: "border-primary/20 bg-primary/10 text-primary",
  extracting: "border-primary/20 bg-primary/10 text-primary",
  chunking: "border-primary/20 bg-primary/10 text-primary",
  embedding: "border-primary/20 bg-primary/10 text-primary",
};

export function StatusBadge({ status, children, className }: { status: string; children: ReactNode; className?: string }) {
  return <Badge variant="outline" className={cn("gap-1.5 px-2.5 py-1", tones[status] ?? "border-border bg-muted text-muted-foreground", className)}>{children}</Badge>;
}
