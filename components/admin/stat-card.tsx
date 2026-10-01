import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  icon: Icon,
  label,
  value,
  tone = "blue",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: "blue" | "teal" | "amber" | "green";
}) {
  const tones: Record<string, string> = {
    blue: "bg-accent text-primary",
    teal: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300",
    green: "bg-success/10 text-success",
  };

  return (
    <Card className="interactive-card">
      <CardContent className="flex items-center gap-4 pt-6">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-2xl font-extrabold tracking-tight text-foreground">{value}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
