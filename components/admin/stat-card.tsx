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
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300",
    teal: "bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300",
    green: "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-300",
  };

  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
